# jsVoronoiPCB
Javascript application to process a circuit board image and output G-code suitable for laser engraver or similar machine. To reduce tool time, the board traces are Voronoi Tesselated. https://en.wikipedia.org/wiki/Voronoi_diagram

The input image is expected to be black-and-white with an optional third color:

WHITE: Etch (Remove copper)

BLACK: Trace (Leave copper, voronoi tesselate)

OTHER: Hole/signal trace  (leave copper, etch around given perimeter)

Procedure:
- Spray-paint a piece of copperclad PCB in flat black. (I used Krylon)
- Etch in laser engraver using output from this applet. (I used an Eleksmaker A3 Pro, 2.5W)
- Scrub with a soapy toothbrush to remove charred paint.
- Etch board as normal with Ferric Chloride or equivalent.
- Remove paint with acetone and swabs. (Selective removal of paint provides solder mask.)

------
UI:
![UI](http://pugbutt.com/jsVoronoiPCB/img/js_voronoi_ui.png)

Input:
![input](http://pugbutt.com/jsVoronoiPCB/img/input_600dpi.png)

Output:
![output](http://pugbutt.com/jsVoronoiPCB/img/output.png)

Etched, Tinned:
![etched](http://pugbutt.com/jsVoronoiPCB/img/etched.jpg)

See Nurdrage's D.I.Y. tinning solution tutorial video here:
https://hackaday.com/2017/10/23/tinning-solution-from-the-hardware-store/

I have a live demo here at the link below, and there are example input 
images in the examples/ folder of this reop.

http://pugbutt.com/jsVoronoiPCB/voronoi_pcb.html

One source of inspiration for this project is the Visolate project which has a similar aim but is written in Java: https://groups.csail.mit.edu/drl/wiki/index.php?title=Visolate:_Voronoi_Toolpaths_for_PCB_Mechanical_Etch
