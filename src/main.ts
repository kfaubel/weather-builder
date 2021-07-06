import stream = require('stream');
import util = require('util');
import fs from 'fs';
import { WeatherImage } from './weatherimage';
import { Logger } from "./Logger";

// Create a new express application instance
async function run() {
    // const app: express.Application = express();

    // const weatherConfig: any = {
    //     agent: "ken@faubel.org",
    //     lat: "41.7476",
    //     lon: "-70.6676",
    //     //zip: "01827",
    //     //mapQuestKey: mapQuestKey.mapQuestKey,
    //     title: "Forecast for Onset, MA"
    // }

    // https://forecast.weather.gov/MapClick.php?lat=42.96&lon=-77.44&FcstType=digitalDWML
    // https://forecast.weather.gov/MapClick.php?lat=41.75&lon=-70.644&FcstType=digitalDWML
    
    const logger: Logger = new Logger("weather-builder"); 

    const weatherConfig: any = {
        name: "Onset",
        lat: "41.75",
        lon: "-70.644",
        title: "Forecast for Onset, MA",
        days: 5
    }
   
    const weatherImage = new WeatherImage(logger);

    const result = await weatherImage.getImageStream(weatherConfig);
    
    // We now get result.jpegImg
    logger.info(`Writing: image.jpg`);

    if (result !== null && result.jpegImg !== null ) {
        fs.writeFileSync('image.jpg', result.jpegImg.data);
    } else {
        logger.error("test.ts: no jpegImg returned from weatherImage.getImageStream");
        process.exit(1);
    }

    if (result !== null && result.stream !== null ) {
        logger.info(`Writing from stream: image2.jpg`);

        const out = fs.createWriteStream('image2.jpg');
        const finished = util.promisify(stream.finished);

        result.stream.pipe(out);
        out.on('finish', () =>  logger.info('The jpg from a stream file was created.'));

        await finished(out); 
    } else {
        logger.error("test.ts: no stream returned from weatherImage.getImageStream");
        process.exit(1);
    }
    
    logger.info("done"); 
}

run();




