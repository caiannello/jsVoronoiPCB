# jsVoronoiPCB
Javascript application to process a circuit board image and output G-code suitable for laser engraver or similar machine. To reduce tool time, the board traces are Voronoi Tesselated. https://en.wikipedia.org/wiki/Voronoi_diagram

The input image is expected to be black-and-white with an optional third color:

WHITE: Etch (Remove copper)

BLACK: Trace (Leave copper, voronoi tesselate)

OTHER: Hole/signal trace  (leave copper, etch around given perimeter)

One source of inspiration for this project is the Visolate project which has a similar aim but is written in Java: https://groups.csail.mit.edu/drl/wiki/index.php?title=Visolate:_Voronoi_Toolpaths_for_PCB_Mechanical_Etch

------

Input:
![input](http://pugbutt.com/jsVoronoiPCB/img/input_600dpi.png)

Output:
![output](http://pugbutt.com/jsVoronoiPCB/img/output.png)

Etched, Tinned:
![etched](http://pugbutt.com/jsVoronoiPCB/img/etched.jpg)
