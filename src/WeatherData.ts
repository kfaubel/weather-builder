/* eslint-disable @typescript-eslint/no-explicit-any */
import xml2js from "xml2js";
import axios, { AxiosResponse, AxiosRequestConfig } from "axios";
import { LoggerInterface } from "./Logger";
import { WeatherLocation } from "./WeatherBuilder";

// Onset" https://forecast.weather.gov/MapClick.php?lat=41.7476&lon=-70.6676&FcstType=digitalDWML
// NOLA   https://forecast.weather.gov/MapClick.php?lat=29.9537&lon=-90.0777&FcstType=digitalDWML

// New data source : https://www.weather.gov/documentation/services-web-api
// Not all data is present

export class WeatherData {
    private lat = "";
    private lon = "";
    private weatherJson: any = null; 
    private weatherXML: string | null = null;

    private logger: LoggerInterface;

    constructor(logger: LoggerInterface) {
        this.logger = logger;
    }    

    // time                     "2019-07-08T17:00:00-04:00" 
    // hourly temp              "72"                        
    // dew point                "58"                        
    // heat index               "72"                        
    // cloud cover              "0" - "100"                 
    // prob of precip           "0" - "100"                
    // humidity                 "42"                        
    // wind speed  sustained    "4"                         
    // wind speed  gust         ???                         
    // direction (degrees true) "0" - "359"                 
    // QPF (amount of rain)     "0.0100"                    
    //
    // One data point per hour.
    // for heat index, no index if weatherJson.dwml.data.parameters.temperature[1].value[i]._attributes["xsi:nil"] == "true"
    // for wind gusts, no gusts if weatherJson.dwml.data.parameters.wind-speed[1].value[i]._attributes["xsi:nil"] == "true"

    public timeString (index: number): string {return this.weatherJson.dwml.data[0]["time-layout"][0]["start-valid-time"][index];}
    public temperature(index: number): number {return this.weatherJson.dwml.data[0].parameters[0].temperature[2].value[index];}
    public dewPoint   (index: number): number {return this.weatherJson.dwml.data[0].parameters[0].temperature[0].value[index];}
    public cloudCover (index: number): number {return this.weatherJson.dwml.data[0].parameters[0]["cloud-amount"][0].value[index];}
    public precipProb (index: number): number {return this.weatherJson.dwml.data[0].parameters[0]["probability-of-precipitation"][0].value[index];}
    public windSpeed  (index: number): number {return this.weatherJson.dwml.data[0].parameters[0]["wind-speed"][0].value[index];}

    // precipAmt may return an XML nil which means no rain and does not convert to a value.  Return 0 in that case.
    public precipAmt  (index: number): number {
        const qpf = this.weatherJson.dwml.data[0].parameters[0]["hourly-qpf"][0].value[index];
        return (typeof qpf === "string") ? +qpf : 0;
    }

    public async getWeatherData(config: WeatherLocation, userAgent: string): Promise<boolean> {
        this.weatherJson = null;

        if (config.lat === undefined || config.lon === undefined) {
            this.logger.error("No lat/lon provided.");
            return false;
        }

        if (Number.isNaN(Number.parseFloat(config.lat)) && Number.isNaN(Number.parseFloat(config.lat))) {
            this.logger.error("Lat/lon are not numbers");
            return false;
        }
        this.lat = config.lat;
        this.lon = config.lon;

        const url = `https://forecast.weather.gov/MapClick.php?lat=${config.lat}&lon=${config.lon}&FcstType=digitalDWML`;

        const options: AxiosRequestConfig = {
            headers: {
                "Content-Encoding": "gzip",
                "User-Agent": userAgent, 
                "Feature-Flags": ""
            },
            timeout: 20000
        };
        
        this.logger.verbose(`WeatherData: Getting for: ${config.name} lat=${config.lat}, lon=${config.lon}, Title: ${config.title}`);

        const startTime = new Date();
        await axios.get(url, options)
            .then(async (res: AxiosResponse) => {
                this.weatherXML = res.data;
                const endTime = new Date();
                this.logger.info(`WeatherData: GET TIME: ${endTime.getTime() - startTime.getTime()}ms`);
            })
            .catch((error: any) => {
                this.logger.warn(`WeatherData: GET Error: ${error}`);
                this.weatherXML = null;
            }); 

        if (this.weatherXML === null) {
            return false;
        }

        try {            
            const parser = new xml2js.Parser(/* options */);
            this.weatherJson = await parser.parseStringPromise(this.weatherXML);
        } catch (e) {
            this.logger.error(`WeatherData: XML to JSON failed for ${config.title}: " + ${e}`);
            return false;
        }
        
        return true;
    }
}
