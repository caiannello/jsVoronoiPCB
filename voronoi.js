/******************************************************************************

Voronoi PCB Project

This project processes a bitmap image of circuit coard artwork and outputs 
gcode suitable for a laser engraver or similar machine.

To reduce tool time, the board traces are Voronoi tesselated. 
( https://en.wikipedia.org/wiki/Voronoi_diagram )

The image is expected to be black-and-white with an optional third color.

White: Etch (Remove copper)
Black: Trace (Leave copper, voronoi tesselate)
Other: Hole/signal trace  (leave copper, etch around given perimeter)

One source of inspiration for this project is the Visolate project which has
a similar aim but is written in Java:

https://groups.csail.mit.edu/drl/wiki/index.php?title=Visolate:
	_Voronoi_Toolpaths_for_PCB_Mechanical_Etch

-------------------------------------------------------------------------------
MIT License

Copyright (c) 2018 Craig A. Iannello

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
******************************************************************************/

var VERSION="0.1";
var canvas, ctx;
var WW,HH;						// width and height of canvas in pixels
var LL;							// total pixels
var isMetric;					// millimeters if true, else inches.
var realWidth;					// mm or in
var realHeight;
var done;
var origArr=null;				// orig image data as 8 bit palettized array 
								// 0:etch, 1:copper, 2: holes/signals
var segArr=null;				// 0:etch, 1:copper, 2:holes/sig, 3:trace0, 4:trace1...
var workArr=null;				// working-image array.
var bitness;					// bits per pixel in palettized image
var palette;
var numColors;
var time_update_start, 
	time_total_start;
var numRegions;
var XX,YY,II,JJ;				// general indices
var bbb,ccc;
var tmpImg;						// used in canvas refresh
var blockSize;					// cell size in interpolator
var narr,carr;
var paths;
var lx,ly;
var gcode,gjog,gcut,gfooter;
var newcut;
// ----------------------------------------------------------------------------
// Loads an image, ensures it is black-and-white with an optional third 
// color, then kicks off the image processing sequence.
// ----------------------------------------------------------------------------
function loadImage() 
{
	var file, fr, img, res;
	var resString = document.getElementById('resolution').value.toUpperCase();
	var origImage;
	var holeColor=null;
	dpii=resString.indexOf('DPI');
	dpcmi=resString.indexOf('DPCM');
	numunits=0;
	if(dpii>=0) numunits++;
	if(dpcmi>=0) numunits++;
	if(numunits!=1)
	{
		alert('Please specify resolution as dpi or dpcm.')
		return;
	}
	if(dpcmi>=0)
	{
		resString=resString.substring(0,dpcmi);
		res=parseFloat(resString);
		isMetric=true;
	}
	if(dpii>=0)
	{
		resString=resString.substring(0,dpii);
		res=parseFloat(resString);
		isMetric=false;
	}
	if(isNaN(res))
	{
		alert('Please specify resolution as dpi or dpcm.')
		return;		
	}
	done=false;	
	time_total_start=new Date();	
	status('Loading...');	
	var input = document.getElementById('selectedFile');   
	file = input.files[0];
	fr = new FileReader();
	fr.onload = createImage;
	fr.readAsDataURL(file);
	function createImage() 
	{
		img = new Image();
		img.onload = imageLoaded;
		img.src = fr.result;
	}
	function imageLoaded() 
	{
		canvas = document.getElementById('canvas');
		ctx = canvas.getContext('2d');    	
		WW = canvas.width = img.width;
		HH = canvas.height = img.height;
		LL=WW*HH;
		if(isMetric)
		{
			realWidth = WW*10.0/res;
			realHeight = HH*10.0/res;
		} else
		{
			realWidth = WW/res;
			realHeight = HH/res;
		}
		ctx.drawImage(img,0,0); 
		origImage=ctx.getImageData(0,0,WW,HH);
		tmpImg =ctx.getImageData(0,0,WW,HH);
		// count colors in image
		origArr=null;
		segArr=null;
		workArr=null;
		numColors=0;
		regionColors=[];
		for(var i=0,a=0;i<LL;i++,a+=4)
		{
			pixelColor=[origImage.data[a+0], origImage.data[a+1], 
							origImage.data[a+2]];
			if(!arrayInArray(regionColors,pixelColor))
			{
				regionColors.push(pixelColor);
				if(++numColors==4)
					break;
			}
		}
		if((numColors==4)||(!(arrayInArray(regionColors,[0,0,0])&&arrayInArray(regionColors,[255,255,255]))))
		{
			alert(	"Image must contain black (for traces), "+
					"white (for non-traces), and an optional "+
					"third color for holes and/or signal traces");
			WW = canvas.width = 100;	        
			HH = canvas.height = 100;
			origImage=null;
			tmpImg=null;
			var input = document.getElementById('selectedFile');
			input.value=null;
			return;
		}
		holeColor=null;
		if(numColors==3)
		{
			for(var i=0;i<numColors;i++)
			{
				c=regionColors[i];
				if(!(isBlack(c)||isWhite(c)))
				{
					holeColor=c;
					break;
				}
			}
			palette=	[
							[255,255,255],
							[0,0,0],
							[holeColor[0],holeColor[1],holeColor[2]]
						];
		} else
		{
			numColors=3;
			palette=	[
							[255,255,255],
							[0,0,0],
							[0,255,0]
						];
		}
		var adiv = document.getElementById('paramsDiv');
		adiv.style="display: none;";
		status('Palettizing...');
		setTimeout(palettize,10);
	}
	function isWhite(c)
	{
		if((c[0]==255)&&(c[1]==255)&&(c[2]==255))
			return true;
		return false;
	}
	function isBlack(c)
	{
		if(c[0]||c[1]||c[2]) 
			return false;
		return  true;
	}
	function palettize()
	{
		bitness=8;
		origArr = new Uint8Array(LL);
		segArr = new Uint8Array(LL);
		for(var i=0,a=0;i<LL;i++,a+=4)
		{
			c=[	origImage.data[a+0], 
				origImage.data[a+1], 
				origImage.data[a+2]];
			if(isWhite(c))	// etch
			{
				origArr[i]=0;
				segArr[i]=0;
			} else if(isBlack(c))	// copper
			{
				origArr[i]=1;
				segArr[i]=1;
			} else
			{
				origArr[i]=2;	// holes/signal traces
				segArr[i]=0;
			}
		}
		img=null;
		origImage=null;
		setTimeout(startTagTraces,10);     	   
	}
}
// ----------------------------------------------------------------------------
function startTagTraces()
{
	status('Tagging Traces...');
	numRegions=0;
	II=0;
	XX=0;
	YY=0;
	time_update_start=new Date();
	setTimeout(tagTraces,10);
}
// ----------------------------------------------------------------------------
// scans the whole image, flood-filling each separate trace (black region) 
// with a distinct color. This gives a starting image for doing the
// Voronoi tesselation.
// ----------------------------------------------------------------------------
function tagTraces()
{
	while(!done)
	{
		c=segArr[II];
		if(c==1)
		{
			if(numColors==256)
			{
				// upsize pixel array to 16 bit
				bitness=16;
				tempArr = new Uint16Array(LL);
				for(var i=0;i<LL;i++)
					tempArr[i]=segArr[i];
				segArr=tempArr;
			} else if(numColors==65536)
			{
				// upsize pixel array to 32 bit	
				bitness=32;
				tempArr = new Uint32Array(LL);
				for(var i=0;i<LL;i++)
					tempArr[i]=segArr[i];
				segArr=tempArr;
			}
			c=pickUniqueColor();		
			floodFill(XX,YY,numColors++);
		}
		if(++II==LL)
		{
			showArray(segArr);
			status("Interpolating...")
			setTimeout(startInterpolate,50);
			return;
		}
		if(++XX==WW)
		{
			XX=0;
			YY++;
			if(oneSecPassed())
			{
				status('Tagging Traces...');			
				setTimeout(tagTraces,10);
				return;
			}			
		}
	}
}
// ----------------------------------------------------------------------------
function startInterpolate()
{
	XX=0;
	YY=0;
	II=0;
	JJ=0;
	if(WW>HH)
		blockSize=WW>>5;
	else
		blockSize=HH>>5;
	if(!blockSize)
		blockSize=1;
	if(bitness==8)
	{
		workArr=new Uint8Array(LL);
		narr=new Uint8Array(Math.floor(WW/blockSize)+5);
	}
	else if(bitness==16)
	{
		workArr=new Uint16Array(LL);
		narr=new Uint16Array(Math.floor(WW/blockSize)+5);
	}
	else
	{
		workArr=new Uint32Array(LL);
		narr=new Uint32Array(Math.floor(WW/blockSize)+5);
	}
	setTimeout(interpolate,50);
}
// ----------------------------------------------------------------------------
// 
//	Examines image as a series of small rectangles.  It finds the closest
//  trace to each corner of the rectangle using a distance function. 
//
//  If all four corners  have the same result, and theres no other traces 
//  inside the rectangle, then we can assume that the rectangle is entirely 
//  within a single voronoi region and can be painted a solid color.
//
//  If one or more corners are close to different traces though, we cut the 
//	rectangle into up to four pieces and repreat the process recursively.
//
//	The distance function is very expensive, so this strategy is intended
//  to minimize calls to it.  It's better than a purely naive implementation,
//  but it could be improved a lot. 
//
//  This whole task is highly parallelizable, so that is one way to speed
//  things up if needed.  (WebGL, WebCL, Web Workers?)
//
// ----------------------------------------------------------------------------
function interpolate()
{
	time_update_start=new Date();
	while(!done)
	{
		x1=XX+blockSize;
		if(x1>=WW)
			x1=WW-1;
		y1=YY+blockSize;
		if(y1>=HH)
			y1=HH-1;
		interpInner(XX,YY,x1,y1);
		XX+=blockSize;
		if(XX>=WW)
		{
			XX=0;
			YY+=blockSize;
			if(YY>=HH)
			{
				narr=null;
				carr=null;
				segArr=null;
				for(II=0;II<LL;II++)
					if(origArr[II]==2)
						workArr[II]=2;
				origArr=null;
				showArray(workArr);
				status("Edge Detect...");
				setTimeout(startEdges,50);
				return;
			}
			if(oneSecPassed())
			{
				pct=round((x1+y1*WW)*100.0/LL,1);
				status('Interpolating '+pct+'%...');
				setTimeout(interpolate,10);
				return;
			}
		}
	}
}
// ----------------------------------------------------------------------------
function startEdges()
{
	XX=0;
	YY=0;
	II=0;
	if(bitness==8)
		segArr=new Uint8Array(LL);
	else if(bitness==16)
		segArr=new Uint16Array(LL);
	else
		segArr=new Uint32Array(LL);
	for(var i=0;i<LL;i++)
		segArr[i]=workArr[i];
	workArr=new Uint8Array(LL);
	setTimeout(edges,50);	
}
// ----------------------------------------------------------------------------
//	Simple edge detect to find pixel outlines of the plotted Voronoi regions.
//	These get vectorized in the next step.
// ----------------------------------------------------------------------------
function edges()
{
	time_update_start=new Date();
	while(!done)
	{
		var edge=false;
		c=segArr[II];
		if((XX==0)||(XX==WW-1)||(YY==0)||(YY==HH-1))
			edge=true;
		else if((XX>0)&&(segArr[II-1]!=c))
			edge=true;
		else if((YY>0)&&(segArr[II-WW]!=c)&&(workArr[II-WW]!=0))
			edge=true;
		if(edge)
			workArr[II]=0;
		else
			workArr[II]=1;
		if(++II==LL)
		{
			segArr=null;
			showArray(workArr);
			status("Vectorizing...");
			setTimeout(startVectorize,50);
			return;
		}
		if(++XX==WW)
		{
			XX=0;
			YY++;
			if(oneSecPassed())
			{
				pct=round(II*100.0/LL,1);				
				status('Finding Edges '+pct+'%...');			
				setTimeout(edges,10);
				return;
			}			
		}
	}
}
// ----------------------------------------------------------------------------
function startVectorize()
{
	XX=0;
	YY=0;
	II=0;
	paths=[];
	bitness=8;
	setTimeout(vectorize,50);
}
// ----------------------------------------------------------------------------
function vectorize()
{
	time_update_start=new Date();
	while(!done)
	{
		if(!workArr[II])
		{		
			path=tracePath(XX,YY);
			if(path.length)
				paths.push(path);
		}
		if(++II==LL)
		{
			showArray(workArr);
			workArr=null;
			setTimeout(startShowPaths,50);
			return;
		}
		if(++XX==WW)
		{
			XX=0;
			YY++;
			if(oneSecPassed())
			{
				pct=round(II*100.0/LL,1);				
				status('Vectorizing '+pct+'%...');			
				setTimeout(vectorize,10);
				return;
			}			
		}
	}	
}
// ----------------------------------------------------------------------------
function startShowPaths()
{
    num_paths=paths.length;
	// sort paths with respect to each other
    for(var i=0;i<(num_paths-1);i++)
    {
        pa=paths[i];
        l=pa.length;
        endx=pa[l-1][0];
        endy=pa[l-1][1];
        bestdist=WW*HH*2;
        bestat=0;
        for(j=i+1;j<num_paths;j++)
        {
            na=paths[j];
            startx=na[0][0];
            starty=na[0][1];
            dx=startx-endx;
            dy=starty-endy;
            dist = Math.sqrt(dx*dx+dy*dy);
            if(dist<bestdist)
            {
                bestdist=dist;
                bestat=j;
            }
        }
        if (bestat!=(i+1))
        {
            buf=paths[i+1];
            paths[i+1]=paths[bestat];
            paths[bestat]=buf;
        }
    }            

	XX=0;
	YY=0;
	II=0;
	lx=0;
	ly=0;
	newcut=true;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, WW,HH);
    ctx.strokeStyle = "#FFFFFF";
    gcode=document.getElementById('gheader').value.toUpperCase().trim()+'\n';
    gjog=document.getElementById('gjog').value.toUpperCase().trim()+'\n';
    gcut=document.getElementById('gcut').value.toUpperCase().trim()+'\n';
    gfooter=document.getElementById('gfooter').value.toUpperCase().trim()+'\n';
    setTimeout(showPaths,50);
}
// ----------------------------------------------------------------------------
function showPaths()
{
	while(!done)
	{
		if(YY>=paths.length)
		{
    			setTimeout(allDone,50);
    			return;
		}
		if(XX<paths[YY].length)
		{
			pt=paths[YY][XX];
			x0=pt[0];
			y0=pt[1];
			x1=pt[2];
			y1=pt[3];

			dx=Math.abs(lx-x0);
			dy=Math.abs(ly-y0);
			if((dx>1)||(dy>1))
			{
				gcode+=gjog;
			    ctx.strokeStyle = "#FF000080";
	    		ctx.beginPath();
	    		ctx.moveTo(lx,ly);	    		
	    		ctx.lineTo(x0,y0);
	    		ctx.stroke();
	            var ux=x0*realWidth/WW;
	            var uy=((HH-1)-y0)*realHeight/HH;
	            if(!isMetric)
	            {
	                ux*=25.4;
	                uy*=25.4;
	            }
	            var uxs=round(ux,3).toString();
	            var uys=round(uy,3).toString();
	            gcode+='G1 X'+uxs+' Y'+uys+'\n';	    		
				gcode+=gcut;
			    ctx.strokeStyle = "#FFFFFFFF";
			} else if (newcut)
			{
				gcode+=gcut;
			}
			newcut=false;
    		ctx.beginPath();
    		ctx.moveTo(x0,y0);
    		ctx.lineTo(x1,y1);
    		ctx.stroke();
            var ux=x1*realWidth/WW;
            var uy=((HH-1)-y1)*realHeight/HH;
            if(!isMetric)
            {
                ux*=25.4;
                uy*=25.4;
            }
            var uxs=round(ux,3).toString();
            var uys=round(uy,3).toString();
            gcode+='G1 X'+uxs+' Y'+uys+'\n';	    		
    		lx=x1;
    		ly=y1;
		}
    	if(++XX>=paths[YY].length)
    	{
    		XX=0;
    		if(++YY>=paths.length)
    		{
    			gcode+=gfooter;
    			setTimeout(allDone,50);
    			return;
    		}
    	}
	}
}
// ----------------------------------------------------------------------------
function allDone()
{
	//var adiv = document.getElementById('paramsDiv');
	//adiv.style="";
	status('All done. Gcode downloaded.');
	var input = document.getElementById('selectedFile');   
	file = input.files[0].name+'.nc';	
	download(file,gcode); 	
	gcode=null;
	paths=null;
	done=true;
}
// ----------------------------------------------------------------------------
function download(filename, text) 
{
  var element = document.createElement('a');
  element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
  element.setAttribute('download', filename);
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}
// ----------------------------------------------------------------------------
// This is what makes the toolpaths from the voronoi edge pixels.
// It tries to replace collinear points with line segments for file size,
// provided they are colinear in any of eight cardinal directions.
//
// There are probably way more optimal ways to do this in terms of reducing
// machine cutting time.  Improvements welcome!
// ----------------------------------------------------------------------------
function tracePath(x0,y0)
{
    var newPos, pixelStack = [[x0, y0]]; 
    var path=[];

    // cardinal directions
	// 	NW  N  NE
	//   W     E
	//  SW  S  SE

    var dirs=[	[-1,-1],[0,-1],[1,-1],
    			[-1,0],		   [1,0],
    			[-1,1],	[0,1], [1,1]];

    // brannch dirs off a cardinal line
    var bdirs=	[
					[[0,-1],[1,0]],
					[[-1,0],[1,0]],
					[[-1,0],[0,1]],
					[[0,-1],[0,1]],
					[[0,1],[0,-1]],
					[[0,-1],[1,0]],
					[[-1,0],[1,0]],
					[[-1,0],[0,-1]],    
    			];

    while (pixelStack.length) 
    {

        newPos = pixelStack.pop();	// get starting point
        x0 = newPos[0];
        y0 = newPos[1];

		for(var i=0;i<8;i++)
		{
			dir=dirs[i];
			dx=dir[0];
			dy=dir[1];
			llen=0;
			x=x0+dx;y=y0+dy;
			while((x>=0)&&(y>=0)&&(x<WW)&&(y<HH)&&(!workArr[x+y*WW]))
			{
		    	workArr[x+y*WW]=2;
		    	if(llen>1)
		    	{
	    			tdir=bdirs[i];

	    			tdx=tdir[0][0];
	    			tdy=tdir[0][1];
	    			tx=x+tdx;ty=y+tdy;
	    			if((tx>=0)&&(ty>=0)&&(tx<WW)&&(ty<HH)&&(!workArr[tx+ty*WW]))
		    			pixelStack.push([tx,ty]);

	    			tdx=tdir[1][0];
	    			tdy=tdir[1][1];
	    			tx=x+tdx;ty=y+tdy;
	    			if((tx>=0)&&(ty>=0)&&(tx<WW)&&(ty<HH)&&(!workArr[tx+ty*WW]))
		    			pixelStack.push([tx,ty]);
		    	}
		    	x+=dx;
		    	y+=dy;
		    	llen++;
			}
			if(llen)
			{
				path.push([x0,y0,x-dx,y-dy]);
				pixelStack.push([x-dx,y-dy]);				
			}
		}

	    workArr[x0+y0*WW]=2;
       
    }
    return path;
}
// ----------------------------------------------------------------------------
function interpInner(x0,y0,x1,y1)
{
	if((x0==0)&&(y0==0))
	{
		aaa=nearestColor(x0,y0);
		bbb=nearestColor(x1,y0);
		ccc=nearestColor(x0,y1);
		ddd=nearestColor(x1,y1);
		narr[0]=ccc;
		narr[1]=ddd;
		II=2;
		JJ=0;
	} else if(x0==0)
	{
		carr=narr;
		if(bitness==8)
			narr=new Uint8Array(Math.floor(WW/blockSize)+5);
		else if(bitness==16)
			narr=new Uint16Array(Math.floor(WW/blockSize)+5);
		else
			narr=new Uint32Array(Math.floor(WW/blockSize)+5);
		aaa=carr[0];
		bbb=carr[1];
		JJ=2;
		ccc=nearestColor(x0,y1);
		ddd=nearestColor(x1,y1);
		narr[0]=ccc;
		narr[1]=ddd;
		II=2;
	} else if(y0==0)
	{
		aaa=bbb;
		bbb=nearestColor(x1,y0);
		ccc=ddd;
		ddd=nearestColor(x1,y1);
		narr[II++]=ddd;
	} else
	{
		aaa=bbb;
		bbb=carr[JJ++];
		ccc=ddd;
		ddd=nearestColor(x1,y1);
		narr[II++]=ddd;
	}
	subDivide(x0,y0,x1,y1,aaa,bbb,ccc,ddd,0);
}
// ----------------------------------------------------------------------------
//
// find closest trace through outward taxicab spiral for Voronoi plot.
//
// The efficiency of this function greatly affects the time to do the Voronoi.
//
// ----------------------------------------------------------------------------
function nearestColor(x0,y0)
{
	var i=x0+y0*WW;
	var c=segArr[i];
	if(c)
		return c;
	var x1=0,y1=0,s=0,d=1;
	while(1)
	{
		if(s==0)
		{
			i++;
			if(++x1==d)
				s++;
		} else if(s==1)
		{
			i+=WW;
			if(++y1==d)
				s++;
		} else if(s==2)
		{
			i--;
			if(--x1==-d)
				s++;
		} else if(s==3)
		{
			i-=WW;
			if(--y1==-d)
			{
				s=0;
				d++;
				if(done)
					return 0;
			}
		}
		x=x0+x1;
		y=y0+y1;
		if((x>=0)&&(y>=0)&&(x<WW)&&(y<HH))
		{
			c=segArr[i];
			if(c)
				return c;
		}
	}
}
// ----------------------------------------------------------------------------
function subDivide(x0,y0,x1,y1,a,b,c,d,depth)
{
	var solid=false,x,y;
	var idx=x0+y0*WW;

	if(done)
		return;

	// a b
	// c d

	if((a==b)&&(b==c)&&(c==d))
	{
		solid=true;
		for(y=y0;(y<=y1)&&solid;y++)
			for(x=x0;x<=x1;x++)
			{
				tc=segArr[x+y*WW];
				if((tc!=0)&&(tc!=a))
				{
					solid=false;
					break;
				}
			}
	}
	
	if(solid)
	{
		// a a
		// a a
		for(y=y0;(y<=y1);y++)
			for(x=x0;x<=x1;x++)
			{
				workArr[x+y*WW]=a;
			}
	} else
	{
		var dx=x1-x0;
		var dy=y1-y0;
		if((dx>1)&&(dy>1))
		{
			// a e b
			// f g h
			// c i d
			dx>>=1;
			dy>>=1;
			var e=nearestColor(x0+dx,y0);
			var f=nearestColor(x0,y0+dy);
			var g=nearestColor(x0+dx,y0+dy);
			var h=nearestColor(x1,y0+dy);
			var i=nearestColor(x0+dx,y1);
			subDivide(x0,y0,x0+dx,y0+dy,a,e,f,g,depth+1);
			subDivide(x0+dx,y0,x1,y0+dy,e,b,g,h,depth+1);
			subDivide(x0,y0+dy,x0+dx,y1,f,g,c,i,depth+1);
			subDivide(x0+dx,y0+dy,x1,y1,g,h,i,d,depth+1);
		} else if(dx>1)
		{
			// a e b
			// c i d
			dx>>=1;
			var e=nearestColor(x0+dx,y0);
			var i=nearestColor(x0+dx,y1);
			subDivide(x0,y0,x0+dx,y1,a,e,c,i,depth+1);
			subDivide(x0+dx,y0,x1,y1,e,b,i,d,depth+1);
		} else if(dy>1)
		{
			// a b
			// f h
			// c d
			dy>>=1;
			var f=nearestColor(x0,y0+dy);
			var h=nearestColor(x1,y0+dy);
			subDivide(x0,y0,x1,y0+dy,a,b,f,h,depth+1);
			subDivide(x0,y0+dy,x1,y1,f,h,c,d,depth+1);
		} else 
		{
			// ab
			// cd
			workArr[idx]=a;
			workArr[idx+1]=b;
			workArr[idx+WW]=c;
			workArr[idx+WW+1]=d;
		}
	}	
}
// ----------------------------------------------------------------------------
function showArray(arr)
{
	for(var i=0,a=0;i<LL;i++,a+=4)
	{
		c=palette[arr[i]];
		tmpImg.data[a+0]=c[0];
		tmpImg.data[a+1]=c[1];
		tmpImg.data[a+2]=c[2];
		tmpImg.data[a+3]=255;
	}
	ctx.putImageData(tmpImg,0,0);
}
// ----------------------------------------------------------------------------
function floodFill(x0,y0,c)
{
    //var p, x, y, l, r;
	var stack = [[x0, y0]];
    while (stack.length) 
    {
        p = stack.pop();
        x = p[0];
        y = p[1];
        i=x+y*WW;
        while (y >= 0 && (segArr[i]==1))
        {
            y -= 1;
            i -=WW;
        }
        y += 1;
        i +=WW;
        l = false;
        r = false;
        while (y <= (HH-1) && (segArr[i]==1))
        {
            segArr[i]=c;
            if (x > 0) 
            {
                if (segArr[i-1]==1) 
                {
                    if (!l) 
                    {
                        stack.push([x - 1, y]);
                        l = true;
                    }
                } else if (l) 
                {
                    l = false;
                }
            }
            if (x < (WW-1)) 
            {
                if (segArr[i+1]==1) 
                {
                    if (!r) 
                    {
                        stack.push([x + 1, y]);
                        r = true;
                    }
                } else if (r) 
                {
                    r = false;
                }
            }
            y += 1;
            i += WW;
        }
    }
}
// ----------------------------------------------------------------------------
function pickUniqueColor(lighten)
{
    c=[0,0,0];
    while(arrayInArray(palette, c))
    {
        r=Math.floor(Math.random() * 192);
        g=Math.floor(Math.random() * 192);
        b=Math.floor(Math.random() * 192);
        c=[r,g,b];
    }
    palette.push(c);
    return c;    
}
// ----------------------------------------------------------------------------
function oneSecPassed()
{
	endtime=new Date();
	dt=endtime.getTime() - time_update_start.getTime();
	if(dt>1000)
	{
		time_update_start=endtime;
		return true;
	}		
	return false;
}
// ----------------------------------------------------------------------------
function status(s)
{
	label = document.getElementById('status');	
	endtime=new Date();
	dt=endtime.getTime() - time_total_start.getTime();
	ss=round(dt/1000.0,1);
	label.innerHTML='Status: '+s+" ("+ss+"s)";
}
// ----------------------------------------------------------------------------
function round(number, precision) 
{
  var shift = function (number, precision, reverseShift) 
  {
	if (reverseShift) 
	{
	  precision = -precision;
	}  
	numArray = ("" + number).split("e");
	return +(numArray[0] + "e" + (numArray[1] ? (+numArray[1] + precision) : precision));
  };
  return shift(Math.round(shift(number, precision, false)), precision, true);
}
// ----------------------------------------------------------------------------
function arraysEqual(arr1, arr2) 
{
	if(arr1.length !== arr2.length)
		return false;
	for(var i = arr1.length; i--;) 
	{
		if(arr1[i] !== arr2[i])
			return false;
	}
	return true;
}
// ----------------------------------------------------------------------------
function arrayInArray(arr,needle) 
{
	var i;
	for(i=0;i<arr.length;i++)
	{
		if(arraysEqual(needle,arr[i]))
			return true;
	}
	return false;
}
// ----------------------------------------------------------------------------
function fileButtonClicked()
{
	var input = document.getElementById('selectedFile')	;
	input.value = null;
	done=true;
	state=0;    
	origImage=null;
	canvas = document.getElementById('canvas');
	ctx = canvas.getContext('2d'); 	
	canvas.width=100;
	canvas.height=100;
}
///////////////////////////////////////////////////////////////////////////////
// EOF
///////////////////////////////////////////////////////////////////////////////
