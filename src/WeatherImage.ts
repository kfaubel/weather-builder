import { LoggerInterface } from "./Logger";
import jpeg from "jpeg-js";
import * as pure from "pureimage";
import { WeatherData } from "./WeatherData";
import path = require("path");

export interface WeatherLocation {
    name: string;
    lat: string;
    lon: string;
    title: string;
    days: number;
}

export interface ImageResult {
    expires: string;
    imageType: string;
    imageData: jpeg.BufferRet | null;
}

export class WeatherImage {
    private weatherData?: WeatherData;
    private logger: LoggerInterface;
    private dirname: string;

    constructor(logger: LoggerInterface, dirname: string) {
        this.logger = logger;
        this.dirname = dirname;
    }
    
    public async getImage(weatherLocation: WeatherLocation): Promise<ImageResult> {
        this.logger.info(`WeatherImage: request for ${weatherLocation.name}`);
        
        this.weatherData = new WeatherData(this.logger);

        const result: boolean = await  this.weatherData.getWeatherData(weatherLocation);

        if (!result) {
            // tslint:disable-next-line:no-console
            this.logger.warn("Failed to get data, no image available.\n");
            return {expires: "", imageType: "", imageData: null};
        }
        
        const wData = this.weatherData;
        
        const imageHeight = 1080; 
        const imageWidth  = 1920; 

        // Screen origin is the upper left corner
        const  chartOriginX = 100;                                               // In from the left edge
        const  chartOriginY = imageHeight - 70;                                  // Down from the top (Was: Up from the bottom edge)

        const topLegendLeftIndent = imageWidth - 300;

        const  chartWidth = 1680;                                                // Smaller than the imageWidth but must be a multiple of hoursToShow
        const  chartHeight = 900;                                                // Smaller than the imageHeight but must be a multiple of 100

        const  daysToShow = weatherLocation.days;                                         // for 5 days (valid is 1..6)
        
        const  showHourGridLines = daysToShow <= 2 ? true : false;               // Only show if we are showing 2 days or less, otherwise its too crowded

        const  hoursToShow = daysToShow * 24;                                    //   120

        const  verticalFineGridLines = daysToShow * 24;                           //   120        every 1 hours  (0-20 for 21 total vertical lines)
        const  verticalGridLines = daysToShow * 4;                               //   20        every 6 hours  (0-20 for 21 total vertical lines)
        const  verticalMajorGridLines = daysToShow;                              //   4         every 4th vertical lines is a day 

        const  verticalFineGridSpacing = chartWidth / verticalFineGridLines;     // horizontal spacing between the vertical lines. 1080 pixels split into 20 chunks
        const  verticalGridSpacing = chartWidth / verticalGridLines;             // horizontal spacing between the vertical lines. 1080 pixels split into 20 chunks
        const  verticalMajorGridSpacing = chartWidth / verticalMajorGridLines;   // horizontal spacing between the vertical lines. 1080 pixels split into 20 chunks

        const  pointsPerHour = chartWidth / hoursToShow;

        const  fullScaleDegrees = 100;
        const  horizontalGridLines = fullScaleDegrees/10;                        // The full scale is devided into a grid of 10. Each represents 10 degrees, percent or miles per hour
        const  horizontalGridSpacing = chartHeight / horizontalGridLines;        // vertical spacing between the horizontal lines. 900 pixels split into 10 chunks
        const  pointsPerDegree = chartHeight/100;                                // vertical pixels per degree temp

        const  fullScaleRain = 0.64;                                             //  Slight rain:      trace        - 0.02 in/hour
        //  Moderate rain:    0.02 in/hour - 0.08 in/hour
        //  Heavy rain:       0.08 in/hour - 0.32 in/hour <== this should be our midpoint
        //  Very heavy rain:  0.32 in/hr   - 0.64 in/hour <== this is full scale
        
        const largeFont  = "48px 'OpenSans-Bold'";   // Title
        const mediumFont = "36px 'OpenSans-Bold'";   // axis labels
        const smallFont  = "24px 'OpenSans-Bold'";   // Legend at the top

        const fntBold     = pure.registerFont(path.join(this.dirname, "..", "fonts", "OpenSans-Bold.ttf"),"OpenSans-Bold");
        const fntRegular  = pure.registerFont(path.join(this.dirname, "..", "fonts", "OpenSans-Regular.ttf"),"OpenSans-Regular");
        const fntRegular2 = pure.registerFont(path.join(this.dirname, "..", "fonts", "alata-regular.ttf"),"alata-regular");
        
        fntBold.loadSync();
        fntRegular.loadSync();
        fntRegular2.loadSync();

        const thinStroke = 1;
        const regularStroke = 3;
        const heavyStroke = 5;

        const backgroundColor     = "rgb(0, 0, 30)";
        const titleColor          = "white";
        const gridLinesColor      = "rgb(100, 100, 100)";
        const majorGridLinesColor = "rgb(150, 150, 150)";
        const temperatureColor    = "rgb(255, 40, 40)";
        const dewPointColor       = "rgb(140, 240, 0)";
        const windSpeedColor      = "yellow";

        const img = pure.make(imageWidth, imageHeight);
        const ctx = img.getContext("2d");

        // Canvas reference
        // origin is upper right
        // coordinates are x, y, width, height in that order
        // to set a color: ctx.fillStyle = 'rgb(255, 255, 0)'
        //                 ctx.fillStyle = 'Red'
        //                 ctx.setFillColor(r, g, b, a);
        //                 ctx.strokeStyle = 'rgb(100, 100, 100)';


        // Fill the bitmap
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, imageWidth, imageHeight);

        // Draw the title
        ctx.fillStyle = titleColor;
        ctx.font = largeFont;
        const textWidth: number = ctx.measureText(weatherLocation.title).width;
        ctx.fillText(weatherLocation.title, (imageWidth - textWidth) / 2, 60);

        // Draw the color key labels        
        ctx.font = smallFont;

        ctx.fillStyle = temperatureColor;
        ctx.fillText("Temperature", topLegendLeftIndent, 30);

        ctx.fillStyle = dewPointColor;
        ctx.fillText("Dew Point", topLegendLeftIndent, 60);

        ctx.fillStyle = windSpeedColor;
        ctx.fillText("Wind Speed", topLegendLeftIndent, 90);

        let startX: number;
        let startY: number;
        let endX: number;
        let endY: number;

        
        // if there are 120 hours to show, and first hour is 0
        // we want to access wData in the range 0-119
        // since each iteration uses i and i+1, we want to loop from 0-118
        //
        // if we start 10 hours into the day, we will loop from 0-109
        //
        // We need to skip past the time that has past today.  Start at current hour
        // We do start plotting the data firstHour * pointsPerHour after the y axis
        const firstHour: number = new Date().getHours(); // 0-23
        
        // Draw the cloud cover in the background (filled)
        ctx.fillStyle = "rgb(50, 50, 50)";
        
        for (let i = 0; i < (hoursToShow - firstHour - 1); i++) {
            startX = chartOriginX + (i + firstHour) * pointsPerHour;
            endX   = chartOriginX + (i + firstHour + 1) * pointsPerHour;
            startY = chartOriginY - wData.cloudCover(i) * pointsPerDegree;
            endY   = chartOriginY - wData.cloudCover(i + 1) * pointsPerDegree;

            ctx.beginPath();
            ctx.moveTo(startX, chartOriginY);          // Start at bottom left
            ctx.lineTo(startX, startY);     // Up to the height of startY
            ctx.lineTo(endX, endY);         // across the top to endY       
            ctx.lineTo(endX, chartOriginY);            // down to the bottom right
            ctx.lineTo(startX, chartOriginY);          // back to the bottom left
            ctx.fill();
        }

        startX = chartOriginX + (hoursToShow -1) * pointsPerHour;
        endX   = chartOriginX + (hoursToShow) * pointsPerHour;
        startY = chartOriginY - wData.cloudCover(hoursToShow - 1) * pointsPerDegree;
        endY   = chartOriginY - wData.cloudCover(hoursToShow) * pointsPerDegree;

        ctx.beginPath();
        ctx.moveTo(startX, chartOriginY);          // Start at bottom left
        ctx.lineTo(startX, startY);     // Up to the height of startY
        ctx.lineTo(endX, endY);         // across the top to endY       
        ctx.lineTo(endX, chartOriginY);            // down to the bottom right
        ctx.lineTo(startX, chartOriginY);          // back to the bottom left
        ctx.fill();

        // Draw the probability of precipitation at the bottom.  The rain amount will cover part of this up.
        ctx.fillStyle = "rgb(40, 60, 100)";  // A little more blue

        for (let i = 0; i < (hoursToShow - firstHour - 1); i++) {
            startX = chartOriginX + (i + firstHour) * pointsPerHour;
            endX   = chartOriginX + (i + firstHour + 1) * pointsPerHour;
            startY = chartOriginY - wData.precipProb(i)  * pointsPerDegree;
            endY = chartOriginY - wData.precipProb(i + 1)  * pointsPerDegree;

            ctx.beginPath();
            ctx.moveTo(startX, chartOriginY);          // Start at bottom left
            ctx.lineTo(startX, startY);     // Up to the height of startY
            ctx.lineTo(endX, endY);         // across the top to endY       
            ctx.lineTo(endX, chartOriginY);            // down to the bottom right
            ctx.lineTo(startX, chartOriginY);          // back to the bottom left
            ctx.fill();
        }

        // Draw the rain amount in the background over the clouds (filled)
        ctx.fillStyle = "rgb(40, 130, 150)";  // A little more blue        

        for (let i = 0; i < (hoursToShow - firstHour - 1); i++) {
            startX = chartOriginX + (i + firstHour) * pointsPerHour;
            endX   = chartOriginX + (i + firstHour + 1) * pointsPerHour;
            startY = chartOriginY - Math.min(wData.precipAmt(i)   *  chartHeight/fullScaleRain, chartHeight); 
            endY   = chartOriginY - Math.min(wData.precipAmt(i+1)  * chartHeight/fullScaleRain, chartHeight);
            //this.logger.info(`Rain at ${i} = ${wData.precipAmt(i)}`);

            ctx.beginPath();
            ctx.moveTo(startX, chartOriginY);          // Start at bottom left
            ctx.lineTo(startX, startY);     // Up to the height of startY
            ctx.lineTo(endX, endY);         // across the top to endY       
            ctx.lineTo(endX, chartOriginY);            // down to the bottom right
            ctx.lineTo(startX, chartOriginY);          // back to the bottom left
            ctx.fill();
        }

        // Draw the last slice
        startX = chartOriginX + (hoursToShow -1) * pointsPerHour;
        endX   = chartOriginX + (hoursToShow) * pointsPerHour;
        startY = chartOriginY - Math.min(wData.precipAmt(hoursToShow - 1)  * chartHeight/fullScaleRain, chartHeight); //wData.precipAmt(hoursToShow - 1) * pointsPerInch;
        endY   = chartOriginY - Math.min(wData.precipAmt(hoursToShow)      * chartHeight/fullScaleRain, chartHeight); //wData.precipAmt(hoursToShow) * pointsPerInch;

        ctx.beginPath();
        ctx.moveTo(startX, chartOriginY);          // Start at bottom left
        ctx.lineTo(startX, startY);     // Up to the height of startY
        ctx.lineTo(endX, endY);         // across the top to endY       
        ctx.lineTo(endX, chartOriginY);            // down to the bottom right
        ctx.lineTo(startX, chartOriginY);          // back to the bottom left
        ctx.fill();

        // Draw the grid lines

        // Draw the thin hour vertical lines
        if (showHourGridLines) {
            ctx.strokeStyle = gridLinesColor;
            ctx.lineWidth = thinStroke;
            for (let i = 0; i <= verticalFineGridLines; i++) {
                startX = chartOriginX + (i * verticalFineGridSpacing);
                endX = chartOriginX + (i * verticalFineGridSpacing);
                startY = chartOriginY;
                endY = chartOriginY - (chartHeight);

                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(endX, endY);
                ctx.stroke();
            }
        }

        // Draw the regular vertical lines
        ctx.strokeStyle = gridLinesColor;
        ctx.lineWidth = regularStroke;
        for (let i = 0; i <= verticalGridLines; i++) {
            startX = chartOriginX + (i * verticalGridSpacing);
            endX = chartOriginX + (i * verticalGridSpacing);
            startY = chartOriginY;
            endY = chartOriginY - (chartHeight);

            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        }

        // Draw the major vertical lines
        ctx.strokeStyle = majorGridLinesColor;
        ctx.lineWidth = heavyStroke;
        for (let i = 0; i <= verticalGridLines; i ++) {
            startX = chartOriginX + (i * verticalMajorGridSpacing);
            endX = chartOriginX + (i * verticalMajorGridSpacing);
            startY = chartOriginY;
            endY = chartOriginY - (chartHeight);

            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        }

        // Draw the horizontal lines
        ctx.strokeStyle = gridLinesColor;
        ctx.lineWidth = regularStroke;
        for (let i = 0; i <= horizontalGridLines; i++) {
            startX = chartOriginX;
            endX = chartOriginX + chartWidth;
            startY = chartOriginY - (i * horizontalGridSpacing);
            endY = chartOriginY - (i * horizontalGridSpacing);

            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        }

        // Draw the major horizontal lines (typically at 0 and 100)
        ctx.strokeStyle = majorGridLinesColor;
        ctx.lineWidth = heavyStroke;
        for (let i = 0; i <= 1; i++) {
            startX = chartOriginX;
            endX   = chartOriginX + chartWidth;
            startY = chartOriginY - (i * chartHeight);
            endY   = chartOriginY - (i * chartHeight);

            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        }

        // Draw an orange line at 75 degrees
        ctx.strokeStyle = "orange";
        startX = chartOriginX;
        endX   = chartOriginX + chartWidth;
        startY = chartOriginY - (horizontalGridSpacing * 75) / 10;
        endY   = chartOriginY - (horizontalGridSpacing * 75) / 10;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Draw an blue line at 32 degrees
        ctx.strokeStyle = "rgb(0, 0, 200)";
        startX = chartOriginX;
        endX = chartOriginX + chartWidth;
        startY = chartOriginY - (horizontalGridSpacing * 32) / 10;
        endY = chartOriginY - (horizontalGridSpacing * 32) / 10;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Draw the axis labels
        ctx.font = mediumFont;
        ctx.fillStyle = "rgb(200, 200, 200)";

        for (let i = 0; i <= horizontalGridLines; i++) {
            // i = 0, 1 ..10    labelString = "0", "10" .. "100"
            const labelString: string = (i * (fullScaleDegrees/horizontalGridLines)).toString(); 

            const labelStringWdth: number = ctx.measureText(labelString).width;
            const x: number = chartOriginX - 50;
            const y: number = chartOriginY + 10 - (i * horizontalGridSpacing);
            ctx.fillText(labelString, x - labelStringWdth / 2, y);
        }       

        const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

        for (let i = 0; i < (hoursToShow / 24); i++) {
            const date = new Date(Date.parse(wData.timeString(i * 24)));
            const dayStr: string = weekday[date.getDay()];
            const dayStrWdth: number = ctx.measureText(dayStr).width;


            const x: number = chartOriginX + (i * 4 + 2) * verticalGridSpacing;
            const y: number = chartOriginY + 40;

            ctx.fillText(dayStr, x - dayStrWdth / 2, y);
        }

        ctx.lineWidth = heavyStroke;

        // Draw the temperature line
        ctx.strokeStyle = temperatureColor;
        ctx.beginPath();
        ctx.moveTo(chartOriginX + pointsPerHour * firstHour, chartOriginY - (wData.temperature(0) * chartHeight) / fullScaleDegrees);
        
        for (let i =  0; i <= (hoursToShow - firstHour - 1); i++) {
            ctx.lineTo(chartOriginX + pointsPerHour * (i + firstHour), chartOriginY - (wData.temperature(i) * chartHeight) / fullScaleDegrees);
        }
        ctx.lineTo(chartOriginX + pointsPerHour * hoursToShow, chartOriginY - (wData.temperature(hoursToShow - firstHour) * chartHeight) / fullScaleDegrees);
        ctx.stroke();

        // Draw the dew point line
        ctx.strokeStyle = dewPointColor;
        ctx.beginPath();
        ctx.moveTo(chartOriginX + pointsPerHour * firstHour, chartOriginY - (wData.dewPoint(0) * chartHeight) / fullScaleDegrees);
        for (let i =  0; i <= (hoursToShow - firstHour - 1); i++) {
            ctx.lineTo(chartOriginX + pointsPerHour * (i + firstHour), chartOriginY - (wData.dewPoint(i) * chartHeight) / fullScaleDegrees);
        }
        ctx.lineTo(chartOriginX + pointsPerHour * hoursToShow, chartOriginY - (wData.dewPoint(hoursToShow - firstHour) * chartHeight) / fullScaleDegrees);        
        ctx.stroke();

        // Draw the wind speed line
        ctx.strokeStyle = windSpeedColor;
        ctx.beginPath();
        ctx.moveTo(chartOriginX + pointsPerHour * firstHour, chartOriginY - (wData.windSpeed(0) * chartHeight) / fullScaleDegrees);
        for (let i =  0; i <= (hoursToShow - firstHour - 1); i++) {
            ctx.lineTo(chartOriginX + pointsPerHour * (i + firstHour), chartOriginY - (wData.windSpeed(i) * chartHeight) / fullScaleDegrees);
        }
        ctx.lineTo(chartOriginX + pointsPerHour * hoursToShow, chartOriginY - (wData.windSpeed(hoursToShow - firstHour) * chartHeight) / fullScaleDegrees);
        ctx.stroke();

        const expires = new Date();
        expires.setHours(expires.getHours() + 2);

        const jpegImg = jpeg.encode(img, 50);
        
        return {
            imageData: jpegImg,
            imageType: "jpg", 
            expires: expires.toUTCString()
        };
    }
}
