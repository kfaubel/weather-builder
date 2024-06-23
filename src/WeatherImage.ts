/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { LoggerInterface } from "./Logger";
import jpeg from "jpeg-js";
import * as pure from "pureimage";
import { WeatherData, WeatherDatasetInterface, DataPoint} from "./WeatherData";
import path = require("path");
import { WeatherLocation } from "./WeatherBuilder";
import moment from "moment-timezone";  // https://momentjs.com/timezone/docs/ &  https://momentjs.com/docs/

// export interface ImageResult {
//     imageType: string;
//     imageData: jpeg.BufferRet | null;
// }

export class WeatherImage {
    private weatherData?: WeatherData;
    private logger: LoggerInterface;
    private imageHeight: number;
    private imageWidth: number;
    private chartOriginX: number;
    private chartOriginY: number;
    private chartWidth: number;
    private chartHeight: number;
    private daysToShow: number;
    private topLegendLeftIndent: number;
    private tempLabelYOffset: number;
    private dewpointLabelYOffset: number;
    private windSpeedLabelYOffset: number;
    //private showHourGridLines: boolean;
    private hoursToShow: number;
    //private verticalFineGridLines: number;
    private verticalGridLines: number;
    private verticalMajorGridLines: number;
    //private verticalFineGridSpacing: number;
    private verticalGridSpacing: number;
    private verticalMajorGridSpacing: number;
    private daysLabelYOffset: number;
    private pointsPerHour: number;
    private fullScaleDegrees: number;
    private horizontalGridLines: number;
    private horizontalGridSpacing: number;
    private pointsPerDegree: number;
    private fullScaleRain: number;

    constructor(logger: LoggerInterface) {
        this.logger = logger;
        this.imageHeight = 1080; 
        this.imageWidth  = 1920; 

        // Screen origin is the upper left corner
        this.chartOriginX = 100;                                                         // In from the left edge
        this.chartOriginY = this.imageHeight - 30;                                       // Down from the top (Was: Up from the bottom edge)

        this.topLegendLeftIndent = this.imageWidth - 200;
        this.tempLabelYOffset = 30;
        this.dewpointLabelYOffset = 60;
        this.windSpeedLabelYOffset = 90;

        this.chartWidth = 1680;                                                          // Smaller than the imageWidth but must be a multiple of hoursToShow
        this.chartHeight = 900;                                                          // Smaller than the imageHeight but must be a multiple of 100

        this.daysToShow = 5;                                                             // for 5 days (valid is 1..6)
        
        //this.showHourGridLines = this.daysToShow <= 2 ? true : false;                    // Only show if we are showing 2 days or less, otherwise its too crowded

        this.hoursToShow = this.daysToShow * 24;                                         //   120

        //this.verticalFineGridLines = this.daysToShow * 24;                               //   120        every 1 hours  (0-20 for 21 total vertical lines)
        this.verticalGridLines = this.daysToShow * 4;                                    //   20        every 6 hours  (0-20 for 21 total vertical lines)
        this.verticalMajorGridLines = this.daysToShow;                                   //   4         every 4th vertical lines is a day 
        this.daysLabelYOffset = 140;               // Offset from the bottom of the chart to the day labels

        //this.verticalFineGridSpacing = this.chartWidth / this.verticalFineGridLines;     // horizontal spacing between the vertical lines. 1080 pixels split into 20 chunks
        this.verticalGridSpacing = this.chartWidth / this.verticalGridLines;             // horizontal spacing between the vertical lines. 1080 pixels split into 20 chunks
        this.verticalMajorGridSpacing = this.chartWidth / this.verticalMajorGridLines;   // horizontal spacing between the vertical lines. 1080 pixels split into 20 chunks

        this.pointsPerHour = this.chartWidth / this.hoursToShow;

        this.fullScaleDegrees = 100;
        this.horizontalGridLines = this.fullScaleDegrees/10;                             // The full scale is devided into a grid of 10. Each represents 10 degrees, percent or miles per hour
        this.horizontalGridSpacing = this.chartHeight / this.horizontalGridLines;        // vertical spacing between the horizontal lines. 900 pixels split into 10 chunks
        this.pointsPerDegree = this.chartHeight/100;                                     // vertical pixels per degree temp

        this.fullScaleRain = 0.64;                                                       //  Slight rain:      trace        - 0.02 in/hour
        //  Moderate rain:    0.02 in/hour - 0.08 in/hour
        //  Heavy rain:       0.08 in/hour - 0.32 in/hour <== this should be our midpoint
        //  Very heavy rain:  0.32 in/hr   - 0.64 in/hour <== this is full scale
    }

    /**
     * myFillRect() - Optimized fillRect for pureimage
     * This optimized fillRect was derived from the pureimage source code: https://github.com/joshmarinacci/node-pureimage/tree/master/src
     * @param image 
     * @param x   - position of the rect
     * @param y   - position of the rect
     * @param w   - width of the rect
     * @param h   - height of the rect
     * @param iw  - width of the image being written into, needed to calculate index into the buffer
     * @param r   - red
     * @param g   - green
     * @param b   - blue
     * @param a   - alpha
     */
    private myFillRect(image: Buffer, x: number, y: number, w: number, h: number, iw: number, r: number, g: number, b: number, a: number) {
        for(let i = y; i < y + h; i++) {                
            for(let j = x; j < x + w; j++) {   
                const index = (i * iw + j) * 4;     
                image[index + 0] = r; 
                image[index + 1] = g; 
                image[index + 2] = b; 
                image[index + 3] = a; 
            }
        }
    }

    /**
     * drawShadedArea() - Draw a shaded area on the chart
     * @param ctx - Canvas context
     * @param currentHour - The current hour to start drawing from
     * @param wData - The weather data array to draw. 0-120 hours
     * @param dataField - The specific element in the data array to draw ("temperature", "dewpoint", ...)
     * @param fillStyle - The fill style (color) to use
     * @returns nothing
     */
    private drawShadedArea = (ctx: any, currentHour: number, wData: DataPoint[], dataField: keyof DataPoint, fillStyle: string, scale: number) => { //, chartOriginX: number, chartOriginY: number, chartWidth: number, chartHeight: number, pointsPerHour: number, wData: WeatherDatasetInterface, firstHour: number, hoursToShow: number, fullScaleDegrees: number, color: string) {
        if (wData === undefined) {
            return;
        }
        ctx.fillStyle = fillStyle;
        let nextX = 0;
        let nextY = 0;
        ctx.beginPath();
        ctx.moveTo(this.chartOriginX + currentHour * this.pointsPerHour, this.chartOriginY);          // Start at baseline 

        // Get the value for the current hour, scale it and limit it to 0-100
        const value = Math.max(Math.min((wData[currentHour]?.[dataField] ?? 0) * scale, 100), 0);
        ctx.lineTo(this.chartOriginX + currentHour * this.pointsPerHour, this.chartOriginY - value * this.pointsPerDegree);  // Draw up to the first point
        for (let i = currentHour + 1; i < (this.hoursToShow); i++) {
            nextX = this.chartOriginX + i * this.pointsPerHour;
            
            // Get the value for the current hour, scale it and limit it to 0-100
            const value = Math.max(Math.min((wData[i]?.[dataField] ?? 0) * scale, 100), 0);
            nextY = this.chartOriginY - value * this.pointsPerDegree;            
            ctx.lineTo(nextX, nextY);    
        }
        // Repeat the last segment to fill the chart, draw down to the baseline and back to the origin
        ctx.lineTo(this.chartOriginX + this.chartWidth, nextY);
        ctx.lineTo(this.chartOriginX + this.chartWidth, this.chartOriginY);            
        ctx.lineTo(this.chartOriginX + currentHour * this.pointsPerHour, this.chartOriginY);  
        ctx.fill();
    };

    /**
     * plotLine() - Draw a line from the currentHour to the end (chart width)
     * @param ctx - Canvas context
     * @param currentHour - The current hour to start drawing from
     * @param wData - The weather data array to draw. 0-120 hours
     * @param dataField - The specific element in the data array to draw ("temperature", "dewpoint", ...)
     * @param fillStyle - The fill style (color) to use
     * @returns nothing
     */
    private plotLine = (ctx: any, currentHour: number, wData: DataPoint[], dataField: keyof DataPoint, color: string, width: number) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(this.chartOriginX + currentHour * this.pointsPerHour, this.chartOriginY - ((wData[currentHour]?.[dataField] ?? 0) * this.chartHeight) / this.fullScaleDegrees);
        for (let i =  currentHour + 1; i < (this.hoursToShow); i++) {
            ctx.lineTo(this.chartOriginX + i * this.pointsPerHour, this.chartOriginY - ((wData[i]?.[dataField] ?? 0) * this.chartHeight) / this.fullScaleDegrees);
        }
        // Extend the line to the end of the chart
        ctx.lineTo(this.chartOriginX + this.chartWidth, this.chartOriginY - ((wData[this.hoursToShow]?.[dataField] ?? 0) * this.chartHeight) / this.fullScaleDegrees);
        ctx.stroke();
    }; 

    /**
     * drawVerticalLine Draw a vertical line on the chart
     * @param ctx    - Canvas context
     * @param x      - x position of the line (Relative to the chartOriginX) 
     * @param color 
     * @param width 
     */
    private drawVerticalLine = (ctx: any, x: number, color: string, width: number) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        const startX = this.chartOriginX + x;
        const endX = this.chartOriginX + x;
        const startY = this.chartOriginY;
        const endY = this.chartOriginY - (this.chartHeight);
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
    };

    /**
     * drawHorizontalLine Draw a horizontal line on the chart
     * @param ctx    - Canvas context
     * @param y      - y position of the line (Relative to the chartOriginY) 
     * @param color 
     * @param width 
     */
    private drawHorizontalLine = (ctx: any, y: number, color: string, width: number) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        const startX = this.chartOriginX;
        const endX = this.chartOriginX + this.chartWidth;
        const startY = this.chartOriginY - y;
        const endY = this.chartOriginY - y;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
    };
    
    /**
     * getImage() - Create an image of the weather data
     * @param lat - Latitude of the location
     * @param lon - Longitude of the location
     * @param title - Title to display on the image
     * @param userAgent - User agent to use for the request
     * @returns Buffer with the image data
     */
    public async getImage(lat: string, lon: string, title: string, userAgent: string): Promise<Buffer | null> {
        this.logger.info(`WeatherImage: request for ${lat},${lon} ${title}`);
        
        this.weatherData = new WeatherData(this.logger, lat, lon, userAgent);
        const result: WeatherDatasetInterface | null = await  this.weatherData.getWeatherData();
        if (!result) {
            return null;
        }

        // this.logger.verbose(JSON.stringify(result, null, 4));
        
        // Data element 0 is midnight of the first day.  
        // The first valid data is at result.dataPoints[firstHour]
        // We start the plot at result.dataPoints[currentHour]
        const wData = result.dataPoints;
        
        const largeFont  = "48px 'OpenSans-Bold'";   // Title
        const mediumFont = "36px 'OpenSans-Bold'";   // axis labels
        const smallFont  = "24px 'OpenSans-Bold'";   // Legend at the top

        // When used as an npm package, fonts need to be installed in the top level of the main project
        const fntBold     = pure.registerFont(path.join(".", "fonts", "OpenSans-Bold.ttf"),"OpenSans-Bold");
        const fntRegular  = pure.registerFont(path.join(".", "fonts", "OpenSans-Regular.ttf"),"OpenSans-Regular");
        const fntRegular2 = pure.registerFont(path.join(".", "fonts", "alata-regular.ttf"),"alata-regular");
        
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

        const img = pure.make(this.imageWidth, this.imageHeight);
        const ctx = img.getContext("2d");

        
        // Canvas reference
        // origin is upper left corner
        // coordinates are x, y, width, height in that order
        // to set a color: ctx.fillStyle = 'rgb(255, 255, 0)'
        //                 ctx.fillStyle = 'Red'
        //                 ctx.setFillColor(r, g, b, a);
        //                 ctx.strokeStyle = 'rgb(100, 100, 100)';

        // Fill the bitmap - slow way
        // ctx.fillStyle = backgroundColor;
        // ctx.fillRect(0, 0, imageWidth, imageHeight);

        this.myFillRect(img.data, 0, 0, this.imageWidth, this.imageHeight, this.imageWidth, 0, 0, 0x20, 0);

        // Draw the title
        ctx.fillStyle = titleColor;
        ctx.font = largeFont;
        const textWidth: number = ctx.measureText(title).width;
        ctx.fillText(title, (this.imageWidth - textWidth) / 2, 60);

        // Draw the color key labels        
        ctx.font = smallFont;

        ctx.fillStyle = temperatureColor;
        ctx.fillText("Temperature", this.topLegendLeftIndent, this.tempLabelYOffset);

        ctx.fillStyle = dewPointColor;
        ctx.fillText("Dew Point", this.topLegendLeftIndent, this.dewpointLabelYOffset);

        ctx.fillStyle = windSpeedColor;
        ctx.fillText("Wind Speed", this.topLegendLeftIndent, this.windSpeedLabelYOffset);

        // Get the current moment in the timezone of the lat/lon
        if (result.timeZone === undefined) {
            this.logger.error(`WeatherImage: Timezone is not defined for ${lat},${lon}`);
            return null;
        }
        const currentHour = moment.tz(result.timeZone).hour();  
        this.logger.verbose(`WeatherImage: Current hour: ${currentHour} in location timezone ${result.timeZone}`); 
        
        // Draw the cloud cover in the background (filled)
        this.drawShadedArea(ctx, currentHour, wData, "skyCover", "rgb(50, 50, 50)", 1);

        // Draw the probability of precipitation at the bottom.  The rain amount will cover part of this up.
        this.drawShadedArea(ctx, currentHour, wData, "probabilityOfPrecipitation", "rgb(40, 60, 100)", 1);

        // Draw the rain amount in the background over the clouds (filled)
        this.drawShadedArea(ctx, currentHour, wData, "quantitativePrecipitation", "rgb(40, 130, 150)", 100);
        
        // Draw the minor vertical grid lines
        for (let i = 0; i <= this.verticalGridLines; i++) {
            this.drawVerticalLine(ctx, i * this.verticalGridSpacing, gridLinesColor, regularStroke);
        }
        
        // Draw the major vertical grid lines
        for (let i = 0; i <= this.verticalMajorGridLines; i++) {
            this.drawVerticalLine(ctx, i * this.verticalMajorGridSpacing, majorGridLinesColor, heavyStroke);
        }

        // Draw the minor horizontal grid lines
        for (let i = 0; i <= this.horizontalGridLines; i++) {
            this.drawHorizontalLine(ctx, i * this.horizontalGridSpacing, gridLinesColor, regularStroke);
        }

        // Draw the major horizontal grid lines at 0 and 100
        for (let i = 0; i <= 1; i++) {
            this.drawHorizontalLine(ctx, i * this.chartHeight, majorGridLinesColor, heavyStroke);
        }
        
        // Draw an orange line at 75 degrees
        this.drawHorizontalLine(ctx, (this.horizontalGridSpacing * 75) / 10, "orange", heavyStroke); 

        // Draw an blue line at 32 degrees        
        this.drawHorizontalLine(ctx, (this.horizontalGridSpacing * 32) / 10, "rgb(0, 40, 240)", heavyStroke);

        ctx.font = mediumFont;
        ctx.fillStyle = "orange";
        ctx.fillText("75 F", this.imageWidth - 120, this.chartOriginY - (this.horizontalGridSpacing * 75) / 10);
        ctx.fillStyle = "rgb(0, 40, 240)";
        ctx.fillText("32 F", this.imageWidth - 120, this.chartOriginY - (this.horizontalGridSpacing * 32) / 10);

        
        // Draw the axis labels
        ctx.font = mediumFont;
        ctx.fillStyle = titleColor; //"rgb(200, 200, 200)";

        for (let i = 0; i <= this.horizontalGridLines; i++) {
            // i = 0, 1 ..10    labelString = "0", "10" .. "100"
            const labelString: string = (i * (this.fullScaleDegrees/this.horizontalGridLines)).toString(); 

            const labelStringWdth: number = ctx.measureText(labelString).width;
            const x: number = this.chartOriginX - 50;
            const y: number = this.chartOriginY + 10 - (i * this.horizontalGridSpacing);
            ctx.fillText(labelString, x - labelStringWdth / 2, y);
        }       

        const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

        // Get the day (0..6) for today in the timezone of the location
        let labelDayIndex = moment().tz(result.timeZone).day();

        for (let i = 0; i < (this.hoursToShow / 24); i++) {
            const dayStr: string = weekday[labelDayIndex];
            const dayStrWdth: number = ctx.measureText(dayStr).width;

            const x: number = this.chartOriginX + (i * 4 + 2) * this.verticalGridSpacing;
            const y: number = this.daysLabelYOffset;

            ctx.fillText(dayStr, x - dayStrWdth / 2, y);
            labelDayIndex++;
            if (labelDayIndex > 6)
                labelDayIndex = 0;
        }

        this.plotLine(ctx, currentHour, wData, "temperature", temperatureColor, heavyStroke); 
        this.plotLine(ctx, currentHour, wData, "dewpoint", dewPointColor, heavyStroke); 
        this.plotLine(ctx, currentHour, wData, "windSpeed", windSpeedColor, heavyStroke); 

        const jpegImg = jpeg.encode(img, 50);
        
        return jpegImg.data;
    }
}
