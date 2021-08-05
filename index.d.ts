declare module "weather-builder";

export interface ImageResult {
    expires: string;
    imageType: string;
    imageData: jpeg.BufferRet | null;
}

export interface WeatherLocation {
    name: string;
    lat: string;
    lon: string;
    title: string;
    days: number;
}

export declare class WeatherImage {
    constructor(logger: LoggerInterface, cache: KacheInterface);
    getImage(weatherLocation: WeatherLocation): Promise<ImageResult | null>;
}