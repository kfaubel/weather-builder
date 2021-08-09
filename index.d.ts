declare module "weather-builder";

export interface WeatherLocation {
    name: string;
    lat: string;
    lon: string;
    title: string;
    days: number;
}
export interface LoggerInterface {
    error(text: string): void;
    warn(text: string): void;
    log(text: string): void;
    info(text: string): void;
    verbose(text: string): void;
    trace(text: string): void;
}

export interface KacheInterface {
    get(key: string): unknown;
    set(key: string, newItem: unknown, expirationTime: number): void;
}

export interface ImageWriterInterface {
    saveFile(fileName: string, buf: Buffer): void;
}

export declare class WeatherBuilder {
    constructor(logger: LoggerInterface, cache: KacheInterface, writer: ImageWriterInterface): void;
    CreateImages(weatherLocation: WeatherLocation): Promise<boolean>
}