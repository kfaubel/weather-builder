/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { LoggerInterface } from "./Logger";
import { KacheInterface } from "./Kache";
import { ImageWriterInterface } from "./SimpleImageWriter";
import { WeatherImage } from "./WeatherImage";

export interface WeatherLocation {
    name: string;
    lat: string;
    lon: string;
    title: string;
    timeZone: string;
    days: number;
}

export class WeatherBuilder {
    private logger: LoggerInterface;
    private cache: KacheInterface;
    private writer: ImageWriterInterface;

    constructor(logger: LoggerInterface, cache: KacheInterface, writer: ImageWriterInterface) {
        this.logger = logger;
        this.cache = cache; 
        this.writer = writer;
    }

    public async CreateImages(weatherLocation: WeatherLocation, userAgent: string): Promise<boolean>{
        try {
            const fileName = `${weatherLocation.name}.jpg`;

            const weatherImage: WeatherImage = new WeatherImage(this.logger);

            const result = await weatherImage.getImage(weatherLocation.lat, weatherLocation.lon, weatherLocation.title, userAgent);

            if (result !== null) {                
                this.logger.info(`WeatherBuilder: Writing: ${fileName}`);
                this.writer.saveFile(fileName, result);
            } else {
                this.logger.warn(`WeatherBuilder: No image for ${fileName}`);
                return false;
            }
        } catch (e) {
            this.logger.error(`WeatherBuilder: Exception: ${e as Error} ${(e as Error).stack}`);
            return false;
        }

        return true;
    }
}
