# weather-builder
This is a module for building images from NWS data.
* It uses pureimage as an alternative to canvas.  Its slower but no native dependencies.

Use stand alone.  This creates image.jpg file in the current directory
```
$ npm install --save weather-builder
```
The following snippet shows how to use it:
```javascript
import fs from 'fs';
import { WeatherImage } from 'weather-builder';

// module requires a logger that can be part of a bigger package
// This uses the minimal set of methods to work using just the console.
const logger = {};
logger.info = (...args) => {console.log(...args)};
logger.verbose = (...args) => {console.debug(...args)};
logger.warn = (...args) => {console.warn(...args)};
logger.error = (...args) => {console.error(...args)};

run() {
    const weatherConfig: any = {
        name: "Onset",
        lat: "41.75",
        lon: "-70.644",
        title: "Forecast for Onset, MA",
        days: 5
    }
    
    const weatherImage = new WeatherImage(logger);

    const result = await weatherImage.getImageStream(weatherConfig);

    if (result !== null && result.jpegImg !== null ) {
        fs.writeFileSync('image.jpg', result.jpegImg.data);
    } else {
        logger.error("No jpegImg returned from weatherImage.getImageStream")
    }
}

run();
```
