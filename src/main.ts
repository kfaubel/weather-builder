import fs from "fs";
import { WeatherLocation, WeatherImage } from "./WeatherImage";
import { Logger } from "./Logger";
import axios, { AxiosResponse } from "axios";

async function run() {
    // const config: any = {
    //     agent: "ken@faubel.org",
    //     lat: "41.7476",
    //     lon: "-70.6676",
    //     title: "Forecast for Onset, MA"
    // }

    // https://forecast.weather.gov/MapClick.php?lat=42.96&lon=-77.44&FcstType=digitalDWML
    // https://forecast.weather.gov/MapClick.php?lat=41.75&lon=-70.644&FcstType=digitalDWML
    
    const logger: Logger = new Logger("weather-builder"); 

    const weatherConfig: WeatherLocation = {
        name: "Onset",
        lat: "41.75",
        lon: "-70.644",
        title: "Forecast for Onset, MA",
        days: 5
    };
   
    const weatherImage = new WeatherImage(logger, __dirname);

    const result = await weatherImage.getImage(weatherConfig);
    
    // We now get result.jpegImg
    logger.info("Writing: image.jpg");

    if (result !== null && result.imageData !== null ) {
        fs.writeFileSync("image.jpg", result.imageData.data);
    } else {
        logger.error("test.ts: no imageData returned from weatherImage.getImageStream");
        process.exit(1);
    }
    
    logger.info("done"); 
}

// if we need to do a zip lookup, do it here or add a new module.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function getLatLon(logger: Logger, zip: string, mapQuestKey: string): Promise<{lat: string, lon: string}> {
    let lat = "";
    let lon = "";
    
    try {
        if (zip !== undefined  && mapQuestKey !== undefined) {
            const mapQuestUrl = `http://www.mapquestapi.com/geocoding/v1/address?key=${mapQuestKey}&location=${zip}`;
            logger.info("Mapquest URL: " + mapQuestUrl);

            const response: AxiosResponse=  await axios.get(mapQuestUrl);

        
            lat = response.data.results[0].locations[0].latLng.lat;
            lon = response.data.results[0].locations[0].latLng.lng;
        } 
    } catch (e) {
        logger.error(`Failed to get lat/lon from MapQuest: ${e}`);
    }

    return ({lat: lat, lon: lon});
}

run();




