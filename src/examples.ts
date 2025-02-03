export interface Example {
  name: string;
  content: string;
}

export const examples: Example[] = [
  {
    name: 'Basic Sphere',
    content: 'sphere(1);',
  },
  {
    name: 'Smooth Union',
    content: `smooth_union(0.3) {
  sphere(1);
  translate([1.5, 0, 0]) sphere(0.8);
}`,
  },
  {
    name: 'Cylinder Array',
    content: `for (var x = [-2:2]) {
  for (var z = [-2:2]) {
    translate([x*2, 0, z*2])
      cylinder(0.4, 2);
  }
}`,
  },
  {
    name: 'Twisted Tower',
    content: `var height = 5;
var segments = 20;
for (var i = [0:segments]) {
  var y = i/segments * height;
  var angle = i/segments * 180;
  rotate([0, 0, angle])
  translate([0, y, 0])
    cube(1);
}`,
  },
  {
    name: 'Recursive Spheres',
    content: `module branch(size, depth) {
  sphere(size);
  if (depth > 0) {
    var newSize = size * 0.6;
    var offset = size * 1.8;
    translate([offset, 0, 0])
      branch(newSize, depth - 1);
    translate([0, offset, 0])
      branch(newSize, depth - 1);
    translate([0, 0, offset])
      branch(newSize, depth - 1);
  }
}

branch(1, 3);`,
  },
];
