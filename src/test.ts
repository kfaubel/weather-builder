/* eslint-disable @typescript-eslint/no-unused-vars */
import dotenv from "dotenv";
import { WeatherLocation } from "./WeatherBuilder";
import { Logger } from "./Logger";
import { Kache } from "./Kache";
import { SimpleImageWriter } from "./SimpleImageWriter";
import { WeatherBuilder } from "./WeatherBuilder";

async function run() {
    dotenv.config();  // Load var from .env into the environment

    const logger: Logger = new Logger("weather-builder", "verbose");
    const cache: Kache = new Kache(logger, "weather-cache.json"); 
    const simpleImageWriter: SimpleImageWriter = new SimpleImageWriter(logger, "images");
    const weatherBuilder: WeatherBuilder = new WeatherBuilder(logger, cache, simpleImageWriter);

    const USER_AGENT: string | undefined = process.env.USER_AGENT;

    if (USER_AGENT === undefined) {
        logger.error("WeatherData: USER_AGENT is not defined in the env (.env), should be an email address");
        return 1;
    } 

    const weatherLocation1: WeatherLocation = {
        name: "Onset",
        lat: "41.75",
        lon: "-70.644",
        title: "Forecast for Onset, MA",
        timeZone: "America/New_York",
        days: 5
    };
   
    const weatherLocation2: WeatherLocation = {
        name: "Nashua",
        lat: "42.71",
        lon: "-71.46",
        title: "Forecast for Nashua, NH",
        timeZone: "America/New_York",
        days: 5
    };
    
    const weatherLocation3: WeatherLocation = {
        name: "Test",
        lat: "41.71",
        lon: "-93.8",
        title: "Forecast for Test",
        timeZone: "America/New_York",
        days: 5
    };
   
    const success: boolean = await weatherBuilder.CreateImages(weatherLocation2, USER_AGENT);

    logger.info(`test.ts: Done: ${success ? "successfully" : "failed"}`); 

    return success ? 0 : 1;
}

run();