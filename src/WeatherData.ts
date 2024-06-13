/* eslint-disable indent */
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
    dataPoints: DataPoint[];     // 121 elements (145-24) starting a midnight of the current day
    timeZone?: string;           // The timezone for the location
}

// 5 days going forward and one day of past data plus the midnight of the last day (6x24 + 1 = 145)
// Point 0 is midnight of the previous day.
// Point 24 is midnight of the current day
// Point 145 is midnight of the last day (same as midnight at the start of the 6th day).
// Note: Before we return this, we will slice off the first 24 hours of data (yesterday)
const numberofDataPoints = 145;  

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
     * The data is an array of 121 elements, each element is a DataPoint object
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
        
        this.logger.verbose(`WeatherData: Getting data for: lat=${this.lat}, lon=${this.lon}, URL: ${url}`);

        const options: AxiosRequestConfig = {
            headers: {
                "Content-Encoding": "gzip",
                "User-Agent": this.userAgent, 
                "Feature-Flags": ""
            },
            timeout: 30000
        };
        
        try {
            const startTime = new Date();
            const res: AxiosResponse = await axios.get(url, options);
            const weatherJSON: NoaaWeatherResponse = res.data;
            const endTime = new Date();
            this.logger.verbose(`WeatherData: GET TIME: ${endTime.getTime() - startTime.getTime()}ms`);        
            
            const dataSet: WeatherDatasetInterface = {
                dataPoints: [],
                timeZone: location.timeZone
            };

            // datapoints is an array of numberofDataPoints (145) elements
            // Element 0 is midnight yesterday, 24 is midnight this morning, 145 is midnight on the 6th dayy
            // Initialize all of the datapoints, most will be overwritten but not all
            // We will remove the first 24 hours of data (yesterday) before returning the data
            for (let i = 0; i < numberofDataPoints; i++) {
                const dataPoint: DataPoint = {
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

            // The data we get from the NWS may start with yesterday's data
            // Each property (temperature, dewpoint, ...) can start at different times
            // A period string P1D0D can start yesterday and continue into today
            // We *assume* that data will not start before yesterday (UTC)

            // Interate over the elements we want to extract from the JSON and fill in the dataArray
            for (const elementName of ["temperature", "dewpoint", "skyCover", "probabilityOfPrecipitation", "windSpeed", "quantitativePrecipitation", "snowfallAmount"]) {
                this.logger.verbose(`WeatherData: Processing element: ${elementName}`);

                const element = weatherJSON.properties[elementName as keyof NoaaWeatherResponse["properties"]] as NoaaForecastSet;
                if (element === undefined) {
                    this.logger.warn(`WeatherData: Element ${elementName} not found in JSON.`);
                    return null;
                }

                // Check if the element variable is an object
                if (typeof element !== "object") {
                    throw new TypeError("WeatherData: element is not an object");
                }
                
                // Check if the values property exists on the element object
                if (!Object.prototype.hasOwnProperty.call(element, "values")) {
                    throw new TypeError("WeatherData: element does not have a values property");
                }

                // First, find the first slot for the element we are processing
                let index = this.getFirstIndex(element.values[0].validTime, location.timeZone);

                if (index === null) {
                    this.logger.warn(`WeatherData: Element ${elementName} firstTime is null. Aborting.`);
                    return null;
                }  

                for (const value of element.values) {

                    if (index >= numberofDataPoints) {
                        // We have processed all the data points we need
                        break;
                    }

                    // Get the number of periods partof the validTime string after the '/' (e.g.: "2024-06-12T03:00:00+00:00/PT1H")
                    const periods = this.getPeriodsFromPeriodString(value.validTime.split("/")[1]);
                    
                    if (periods === null) {
                        this.logger.warn(`WeatherData: Element ${elementName} Unknown period ${value.validTime.split("/")[1]}`);
                        return null;
                    }

                    if (isNaN(periods)) {
                        this.logger.warn(`WeatherData: Element ${elementName} Unknown period ${value.validTime.split("/")[1]}`);
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
            }
            
            // this.logger.verbose(`WeatherData: Data: ${JSON.stringify(dataSet, null, 4)}`);
            dataSet.dataPoints = dataSet.dataPoints.slice(24);  // Remove the first 24 hours of data (yesterday)
            return dataSet;
    
        } catch (error: any) {
            this.logger.warn(`WeatherData: GET Error: ${error.stack}`);
            return null;
        }
    };

    /**
     * getPeriodsFromPeriodString
     *   Strings of this form are supported: "PT1H".."PT24H", "P1D", "P1DT1H".."P2DT24H"
     * @param periodStr - ISO 8601 period string
     * @returns number of periods in the string or null if the string is not recognized
     */
    private getPeriodsFromPeriodString = (periodStr: string): number | null => {
        let periods = 0;

        try {
            // this.logger.verbose(`WeatherData: *** getPeriodsFromPeriodString: ${periodStr}`);
            periodStr = periodStr.split("P")[1];  // Strip the initial 'P'

            // periodStr may have 2 parts separated by the 'T' character.  The first part is the number of days, the second part is the number of hours
            let periodDayStr = "";
            let periodHourStr = "";
            if (periodStr.includes("T")) {
                // If there is a 'T' character, then the string at least has a time part, the day part may be empty
                periodDayStr = periodStr.split("T")[0]; // The part before the 'T' can be: "", "1D', "2D", ...
                periodHourStr = periodStr.split("T")[1]; // The part after the 'T' can be: "", "1H", "2H", ...
            } else {
                // If there is no 'T' character, then the entire string is the number of days
                periodDayStr = periodStr;
            }

            if (periodDayStr !== "") {
                const days = parseInt(periodDayStr.split("D")[0]);  // if the periodDayStr is 1D, we want the int 1
                if (isNaN(days)) {
                    this.logger.warn(`WeatherData: Unknown days from periodStr: ${periodStr}`);
                    return null;
                }
                periods += days * 24;  // Add the number of days * 24 to periods
            }

            if (periodHourStr !== "") {
                const hours = parseInt(periodHourStr.split("H")[0]);  // if the periodHourStr is 4H, we want the int 4
                if (isNaN(hours)) {
                    this.logger.warn(`WeatherData: Unknown hours from periodStr: ${periodStr}`);
                    return null;
                }
                periods += hours;  // Add the number of hours to periods
            }
        } catch (error: any) {
            this.logger.warn(`WeatherData: getPeriodsFromPeriodString for ${periodStr}, Error: ${error.stack}`);
            return null;
        }

        return periods;
    };

    /** */
    private getFirstIndex = (firstDateStr: string, localTimezone: string): number | null => {
        const firstTime = moment.utc(firstDateStr.split("/")[0]);  // e.g.: "2024-06-12T03:00:00+00:00" UTC
        const firstTimeLocal = firstTime.tz(localTimezone);

        // Check to see if the firstTimeLocal is yesterday or today in the local timezone
        // Note: startOf() mutates the moment object so we need to clone it first
        const firstTimeLocalStart = firstTimeLocal.clone().startOf("day");
        const todayLocal = moment().tz(localTimezone).startOf("day");
        if (firstTimeLocalStart.isBefore(todayLocal)) {
            // The firstTime is before today, assume it is yesterday
            return firstTimeLocal.hour();
        } else if (firstTimeLocalStart.isSame(todayLocal)) {
            // The firstTime is today.  Start in slots 24-47
            return firstTimeLocal.hour() + 24;
        } else {
            this.logger.warn(`WeatherData: firstTimeLocalStart: ${firstTimeLocalStart}`);
            this.logger.warn(`WeatherData: todayLocal:          ${todayLocal}. Aborting.`);
            return null;
        }
    };
}