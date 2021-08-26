/* eslint-disable @typescript-eslint/no-explicit-any */
import xml2js from "xml2js";
import axios, { AxiosResponse } from "axios";
import { LoggerInterface } from "./Logger";
import { WeatherLocation } from "./WeatherImage";

// Onset" https://forecast.weather.gov/MapClick.php?lat=41.7476&lon=-70.6676&FcstType=digitalDWML
// NOLA   https://forecast.weather.gov/MapClick.php?lat=29.9537&lon=-90.0777&FcstType=digitalDWML

// New data source : https://www.weather.gov/documentation/services-web-api
// Not all data is present

export class WeatherData {
    private lat = "";
    private lon = "";
    private weatherJson: any = null; 

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

    public async getWeatherData(config: WeatherLocation): Promise<boolean> {
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
        let NWS_USER_AGENT: string | undefined = process.env.NWS_USER_AGENT;

        if (NWS_USER_AGENT === undefined) {
            this.logger.warn("WeatherData: NWS_USER_AGENT is not defined in the env, should be an email address");
        } else {
            NWS_USER_AGENT = "test@test.com";
        }

        const headers = {
            "User-agent": NWS_USER_AGENT
        };

        this.logger.info(`WeatherData: Getting for: ${config.name} lat=${config.lat}, lon=${config.lon}, Title: ${config.title}`);

        try {
            const response: AxiosResponse = await axios.get(url, {headers: {headers}, timeout: 10000});
            
            const parser = new xml2js.Parser(/* options */);
            this.weatherJson = await parser.parseStringPromise(response.data);
        } catch (e) {
            this.logger.error("XML to JSON failed: " + e);
            return false;
        }
        
        return true;
    }
}
