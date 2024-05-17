/* eslint-disable @typescript-eslint/no-explicit-any */
import axios, { AxiosResponse, AxiosRequestConfig } from "axios";
import { LoggerInterface } from "./Logger";
import { WeatherLocation, getWeatherLocation } from "./WeatherLocation";
import moment from "moment-timezone";

// These "Noaa" interfaces are used to parse the JSON response from the National Weather Service API
interface NoaaForecastValue {
    value: string;
    validTime: string;
}

interface NoaaForecastSet {
    uom: string;
    values: NoaaForecastValue[];
}

interface NoaaWeatherResponse {
    properties: {
        validTimes: string;
        temperature: NoaaForecastSet
        dewpoint: NoaaForecastSet;
        skyCover: NoaaForecastSet;
        probabilityOfPrecipitation: NoaaForecastSet;
        windSpeed: NoaaForecastSet;
        quantitativePrecipitation: NoaaForecastSet;
        snowfallAmount: NoaaForecastSet;
    };
}

// The WeatherDatasetInterface is passed back to the caller with the weather data
export interface DataPoint {
    index?: number;
    temperature: number;
    dewpoint: number;
    skyCover: number;
    probabilityOfPrecipitation: number;
    windSpeed: number;
    quantitativePrecipitation: number;
    snowfallAmount: number;
}

export interface WeatherDatasetInterface {
    startTime : string;          // ISO8601 date/time string for the first data point, in the local timezone for the lat/lon location
    firstHour: number;           // The first hour of the data set (0-23)  
    numberOfDataPoints: number;  // Number of data points in the data set 
    dataPoints: DataPoint[];     // First valid element is dataPoints[firstHour]
}

const numberofDataPoints = 121; // 121 data points, 0 to 120 inclusive, 0 is the first hour, 120 is the last hour

// New data source : https://www.weather.gov/documentation/services-web-api

export class WeatherData {
    private lat = "";
    private lon = "";
    private userAgent = "";

    private logger: LoggerInterface;

    constructor(logger: LoggerInterface, lat: string, lon: string, userAgent: string) {
        this.logger = logger;
        this.lat = lat;
        this.lon = lon;
        this.userAgent = userAgent;
    }       

    /**
     * getWeatherData() - Get the weather data for the location
     * The data is an array of 121 elements, each element is a DataPoint object containing fields like 
     * @returns WeatherDatasetInterface or null if there is an error
     */
    public getWeatherData = async (): Promise<WeatherDatasetInterface | null> => {
        if (this.lat === undefined || this.lon === undefined) {
            this.logger.error("No lat/lon provided.");
            return null;
        }

        const location: WeatherLocation | null = await getWeatherLocation(this.logger, this.lat, this.lon, this.userAgent);

        if (location === null) {
            return null;
        }

        const url =`https://api.weather.gov/gridpoints/${location.gridId}/${location.gridX},${location.gridY}`;
        
        this.logger.verbose(`WeatherData: Getting data for: lat=${this.lat}, lon=${this.lon}, Agent: ${this.userAgent}`);
        this.logger.verbose(`WeatherData: GET URL: ${url}`);

        const options: AxiosRequestConfig = {
            headers: {
                "Content-Encoding": "gzip",
                "User-Agent": this.userAgent, 
                "Feature-Flags": ""
            },
            timeout: 5000
        };
        
        try {
            const startTime = new Date();
            const res: AxiosResponse = await axios.get(url, options);
            const weatherJSON: NoaaWeatherResponse = res.data;
            const endTime = new Date();
            this.logger.verbose(`WeatherData: GET TIME: ${endTime.getTime() - startTime.getTime()}ms`);
        
            const observationTimeStr = weatherJSON.properties.validTimes.split("/")[0];
            const observationLocalTime = moment.utc(observationTimeStr).tz(location.timeZone);
            this.logger.verbose(`WeatherData: Observation Local Time: ${observationLocalTime.format("YYYY-MM-DDTHH:mm:ss")}`);
        
            
            const firstHour: number = observationLocalTime.hour(); // 0-23
            const dataSet: WeatherDatasetInterface = {
                startTime: observationLocalTime.format("YYYY-MM-DDTHH:mm:ss"),
                firstHour: firstHour,
                numberOfDataPoints: numberofDataPoints,
                dataPoints: []
            };

            // datapoints is an array of numberofDataPoints (121) elements
            // Element 0 is midnight on the first day, Element 120 is 11PM on the last day
            // Since we are pulling data during the day, some of the first elements will havc 0s
            // The first valid element is dataPoints[firstHour]
            for (let i = 0; i < numberofDataPoints; i++) {
                const dataPoint: DataPoint = {
                    //time: observationLocalTime.add(i, "hour").format("YYYY-MM-DDTHH:mm:ss"),
                    index: i,
                    temperature: 0,
                    dewpoint: 0,
                    skyCover: 0,
                    probabilityOfPrecipitation: 0,
                    windSpeed: 0,
                    quantitativePrecipitation: 0,
                    snowfallAmount: 0
                };

                dataSet.dataPoints.push(dataPoint);
            }

            // Interate over the elements we want to extract from the JSON and fill in the dataArray
            for (const elementName of ["temperature", "dewpoint", "skyCover", "probabilityOfPrecipitation", "windSpeed", "quantitativePrecipitation", "snowfallAmount"]) {
                const element = weatherJSON.properties[elementName as keyof NoaaWeatherResponse["properties"]] as NoaaForecastSet;
                if (element === undefined) {
                    this.logger.warn(`WeatherData: Element ${elementName} not found in JSON.`);
                    return null;
                }

                let index = firstHour;

                // Check if the element variable is an object
                if (typeof element !== "object") {
                    throw new TypeError("KTF: element is not an object");
                }
                
                // Check if the values property exists on the element object
                if (!Object.prototype.hasOwnProperty.call(element, "values")) {
                    throw new TypeError("KTF: element does not have a values property");
                }

                for (const value of element.values) {
                    if (index >= numberofDataPoints) {
                        // We have processed all the data points we need
                        break;
                    }

                    // Each value has a validTime and a value: "2024-05-10T04:00:00+00:00/PT2H",
                    // We need the period part (PT2H) and we will strip the "PT" and the "H" to get the number of hours
                    let periodStr = value.validTime.split("/")[1];  // get just the PT1H part
                    periodStr = periodStr.split("PT")[1]; // Take all but the initial 'PT'
                    periodStr = periodStr.split("H")[0];  // Take all but the final 'H'
                    const periods = parseInt(periodStr);  // periods is the number of hours 1-24

                    if (isNaN(periods)) {
                        this.logger.warn(`WeatherData: Element ${elementName} Unknown period ${periodStr}`);
                        return null;
                    }

                    let elementValue = parseFloat(value.value);
                    if (isNaN(elementValue)) {
                        this.logger.warn(`WeatherData: Element ${elementName} Unknown value ${value.value}`);
                        return null;
                    }

                    // If the element is in Celsius, convert to Fahrenheit
                    if (element.uom === "wmoUnit:degC") { 
                        elementValue = elementValue * 9 / 5 + 32;
                    }

                    // If the element is in km/h, convert to mph
                    if (element.uom === "wmoUnit:km_h-1") {
                        elementValue = elementValue / 1.60934;
                    }

                    // If the element is in mm, convert to inches
                    if (element.uom === "wmoUnit:mm") {
                        elementValue = elementValue * 0.0393701;
                    }

                    // Fill in the data for the number of periods specified by the periods field calculated above.
                    for (let i = 0; i < periods; i++) {
                        const dataPoint: DataPoint = dataSet.dataPoints[index]; 
                        dataPoint[elementName as keyof DataPoint] = elementValue; 

                        index++;

                        if (index >= numberofDataPoints) {
                            break;
                        }
                    }
                }

                this.logger.verbose(`WeatherData: Processed Element ${elementName} processed.`);
            }
            
            // this.logger.verbose(`WeatherData: Data: ${JSON.stringify(dataSet, null, 4)}`);
            return dataSet;
    
        } catch (error: any) {
            this.logger.warn(`WeatherData: GET Error: ${error}`);
            return null;
        }
    };
}