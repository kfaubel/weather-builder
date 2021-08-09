import { WeatherLocation } from "./WeatherImage";
import { Logger } from "./Logger";
import { Kache } from "./Kache";
import { SimpleImageWriter } from "./SimpleImageWriter";
import { WeatherBuilder } from "./WeatherBuilder";

async function run() {
    const logger: Logger = new Logger("weather-builder", "verbose");
    const cache: Kache = new Kache(logger, "weather-cache.json"); 
    const simpleImageWriter: SimpleImageWriter = new SimpleImageWriter(logger, "images");
    const weatherBuilder: WeatherBuilder = new WeatherBuilder(logger, cache, simpleImageWriter);

    const weatherLocation: WeatherLocation = {
        name: "Onset",
        lat: "41.75",
        lon: "-70.644",
        title: "Forecast for Onset, MA",
        days: 5
    };
   
    const success: boolean = await weatherBuilder.CreateImages(weatherLocation);

    logger.info(`test.ts: Done: ${success ? "successfully" : "failed"}`); 

    return success ? 0 : 1;
}

run();