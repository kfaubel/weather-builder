const convert = require('xml-js');
const axios = require('axios');

// Onset" https://forecast.weather.gov/MapClick.php?lat=41.7476&lon=-70.6676&FcstType=digitalDWML
// NOLA   https://forecast.weather.gov/MapClick.php?lat=29.9537&lon=-90.0777&FcstType=digitalDWML

// New data source : https://www.weather.gov/documentation/services-web-api
// Not all data is present

export class WeatherData {
    private lat: string = "";
    private lon: string = "";
    private rainScaleFactor = 1000; // Rain at .2 in/hr will be scaled to 100 (full range)
    private weatherJson: any = null; //
    // private urlTemplate: string = `https://forecast.weather.gov/MapClick.php?lat=${this.lat}&lon=${this.lon}&FcstType=digitalDWML`;  //Onset
    // private url: string = "";
    // private agent: string = "";

    private logger;

    constructor(logger: any) {
        this.logger = logger;
    }    

    // time                     "2019-07-08T17:00:00-04:00" weatherJson.dwml.data.time-layout.start-valid-time[i]._text
    // hourly temp              "72"                        weatherJson.dwml.data.parameters.temperature[2].value[i]._text
    // dew point                "58"                        weatherJson.dwml.data.parameters.temperature[0].value[i]._text
    // heat index               "72"                        weatherJson.dwml.data.parameters.temperature[1].value[i]._text
    // cloud cover              "0" - "100"                 weatherJson.dwml.data.parameters.cloud-amount.value[i]._text
    // prob of precip           "0" - "100"                 weatherJson.dwml.data.parameters.probability-of-precipitation.value[i]._text
    // humidity                 "42"                        weatherJson.dwml.data.parameters.humidity.value[i]._text
    // wind speed  sustained    "4"                         weatherJson.dwml.data.parameters.wind-speed[0].value[i]._text  
    // wind speed  gust         ???                         weatherJson.dwml.data.parameters.wind-speed[1].value[i]._text
    // direction (degrees true) "0" - "359"                 weatherJson.dwml.data.parameters.direction.value[i]._text
    // QPF (amount of rain)     "0.0100"                    weatherJson.dwml.data.parameters.hourly-qpf.value[i]._text
    //
    // One data point per hour.
    // for heat index, no index if weatherJson.dwml.data.parameters.temperature[1].value[i]._attributes["xsi:nil"] == "true"
    // for wind gusts, no gusts if weatherJson.dwml.data.parameters.wind-speed[1].value[i]._attributes["xsi:nil"] == "true"

    public timeString (index: number): number {return this.weatherJson.dwml.data["time-layout"]["start-valid-time"][index]._text};
    public temperature(index: number): number {return this.weatherJson.dwml.data.parameters.temperature[2].value[index]._text};
    public dewPoint   (index: number): number {return this.weatherJson.dwml.data.parameters.temperature[0].value[index]._text};
    public cloudCover (index: number): number {return this.weatherJson.dwml.data.parameters["cloud-amount"].value[index]._text};
    public precipProb (index: number): number {return this.weatherJson.dwml.data.parameters["probability-of-precipitation"].value[index]._text};
    public windSpeed  (index: number): number {return this.weatherJson.dwml.data.parameters["wind-speed"][0].value[index]._text};
    public precipAmt  (index: number): number {return this.weatherJson.dwml.data.parameters["hourly-qpf"].value[index]._text};

    public async getWeatherData(config) {
        let weatherXml: string = "";
        if (config.zip !== undefined  && config.mapQuestKey !== undefined) {
            const mapQuestUrl = `http://www.mapquestapi.com/geocoding/v1/address?key=${config.mapQuestKey}&location=${config.zip}`
            this.logger.info("Mapquest URL: " + mapQuestUrl);

            await axios.get(mapQuestUrl)
            .then((response: any) => {
                // handle success
                config.lat = response.data.results[0].locations[0].latLng.lat;
                config.lon = response.data.results[0].locations[0].latLng.lng;
            })
            .catch((error: string) => {
                // handle error
                // tslint:disable-next-line:no-console
                this.logger.error("Error: " + error);
                weatherXml = "";
            });
        }

        if (config.lat === undefined || config.lon === undefined) {
            this.logger.error("No lat/lon provided.")
            return null;
        }

        if (Number.isNaN(Number.parseFloat(config.lat)) && Number.isNaN(Number.parseFloat(config.lat))) {
            this.logger.error("Lat/lon are not numbers");
            return null;
        }

        const url = `https://forecast.weather.gov/MapClick.php?lat=${config.lat}&lon=${config.lon}&FcstType=digitalDWML`;
        let NWS_USER_AGENT: any = process.env.NWS_USER_AGENT;

        if (NWS_USER_AGENT === undefined) {
            this.logger.warn(`WeatherData: NWS_USER_AGENT is not defined in the env, should be an email address`);
        } else {
            NWS_USER_AGENT = "test@test.com";
        }

        // tslint:disable-next-line:no-console
        //console.log("URL: " + url);

        const headers = {
            'Access-Control-Allow-Origin': '*',
            'User-agent': NWS_USER_AGENT
        };

        this.logger.info(`WeatherData: Getting for: ${config.name} lat=${config.lat}, lon=${config.lon}, Title: ${config.title}`)

        await axios.get(url)
            .then((response: any) => {
                // handle success
                //console.log("Success: " + response.data);
                weatherXml = response.data;
            })
            .catch((error: string) => {
                // handle error
                // tslint:disable-next-line:no-console
                this.logger.error("Error: " + error);
                weatherXml = "";
            });

        if (weatherXml === "") {
            return false;
        }

        let weatherString: string = "";
        try {
            weatherString = convert.xml2json(weatherXml, { compact: true, spaces: 4 });
        } catch (e) {
            // tslint:disable-next-line:no-console
            this.logger.error("XML to JSON failed: " + e);
            return false;
        }

        if (weatherString === "") {
            // tslint:disable-next-line:no-console
            this.logger.error("XML to JSON failed since weatherString is empty: ");
            return false;
        }

        try {
            this.weatherJson = JSON.parse(weatherString);
        } catch (e) {
            // tslint:disable-next-line:no-console
            this.logger.error("Parse JSON failed: " + e);
            return false;
        }

        if (this.weatherJson === undefined) {
            // tslint:disable-next-line:no-console
            this.logger.error("weatherJSON is undefined");
            return false;
        }

        // tslint:disable-next-line:no-console
        // console.log("JSON: " + JSON.stringify(this.weatherJson, null, 4));
        
        // Fix up the rain forcast data: 
        //  - handle nil attributes (missing _text) 
        //  - scale by 1000.
        for (let i: number = 0; i < 120; i++) {
            if (this.weatherJson.dwml.data.parameters["hourly-qpf"].value[i].hasOwnProperty("_text") === true) {
                this.weatherJson.dwml.data.parameters["hourly-qpf"].value[i]._text 
                    = Math.min(this.weatherJson.dwml.data.parameters["hourly-qpf"].value[i]._text * this.rainScaleFactor, 100);
            } else {
                this.weatherJson.dwml.data.parameters["hourly-qpf"].value[i]._text = "0.0";
            }
        }

        return true;
    }
}
