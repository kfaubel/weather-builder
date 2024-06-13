/* eslint-disable @typescript-eslint/no-explicit-any */
import axios, { AxiosResponse, AxiosRequestConfig } from "axios";
import { LoggerInterface } from "./Logger";

export interface WeatherLocation {
    gridId: string;
    gridX: string;
    gridY: string;
    timeZone: string;
}

// To get forecast data for a given lat/lon the first step is to get the forecast office and the gridX and gridY values for the location.
// This is done by calling the following URL: https://api.weather.gov/points/41.7476,-70.6676
// The 'properties' object in the response will contain the forecast office (gridId), the gridX and gridY values and the tiemZone 
//    (e.g. "gridId": "BOX", "gridX": 55, "gridY": 102, timeZone: "America/New_York")
// TimeZones are New_York, Chicago, Denver, Phoenix, Los_Angeles, Anchorage, Honolulu

/**
 * Get the weather location data from the National Weather Service API
 * @param logger      Logger object to log messages
 * @param lat         Latitude of the location
 * @param lon         Longitude of the location
 * @param userAgent   Email address or other contact information requested by the API
 * @returns           WeatherLocation object with gridId, gridX, gridY, and timeZone or null if there is an error
 */
export const getWeatherLocation = async (logger: LoggerInterface, lat: string, lon: string, userAgent: string): Promise<WeatherLocation | null> => {
    let locationJSON = null;
    
    const url = `https://api.weather.gov/points/${lat},${lon}`;

    const options: AxiosRequestConfig = {
        headers: {
            "Content-Encoding": "gzip",
            "User-Agent": userAgent, 
            "Feature-Flags": ""
        },
        timeout: 5000
    };

    const startTime = new Date();
    await axios.get(url, options)
        .then(async (res: AxiosResponse) => {
            locationJSON = res.data;
            const endTime = new Date();
            logger.verbose(`WeatherLocation: GET TIME: ${endTime.getTime() - startTime.getTime()}ms`);
        })
        .catch((error: any) => {
            logger.warn(`WeatherLocation: GET Error: ${error}`);
            locationJSON = null;
        }); 

    if (locationJSON === null) {
        return null;
    }

    const location: WeatherLocation = {
        gridId: (locationJSON as any).properties.gridId,
        gridX: (locationJSON as any).properties.gridX,
        gridY: (locationJSON as any).properties.gridY,
        timeZone: (locationJSON as any).properties.timeZone
    };

    //logger.verbose(`WeatherLocation: Data for ${lat},${lon}: ${JSON.stringify(location)}`);

    return location;
};    
