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
    name: 'Window Wedge',
    content: `/* Stick it on your window frame to keep it open.*/
var width = 34;
var height = 15;
var corner=35.4;
smooth_difference(1) {
  smooth_difference(0.1) {
    smooth_difference() {
      cube([width+25, 30, height+20]);
      translate([0-corner, 0, 0-corner]) rotate([0, 45, 0]) cube([50, 50, 50]);
      translate([corner, 0, 0-corner]) rotate([0, -45, 0]) cube([50, 50, 50]);
    }
    translate([0, 0, 17]) detail(0.2) cube([width, 50, 30]);
  }
  union() {
    translate([0, 19, -8]) rotate([0, 0, 90]) cylinder(5, 200);
    translate([0, -19, -8]) rotate([0, 0, 90]) cylinder(5, 200);
  }
}`,
  },
  {
    name: 'Spiky Massage Ball',
    content: `/**
 * A spiky massage ball.
 * That's it.
 * Note: it's a bit suboptimal because some of the spikes
 * have different heights. Improvements welcome.
 */
sdf(face(
  sqrt(sqr(x) + sqr(y) + sqr(z)) - 16 -
    2 * sin(8 * ( x / sqrt(sqr(x) + sqr(y) + sqr(z)) ))
      * sin(8 * ( y / sqrt(sqr(x) + sqr(y) + sqr(z)) ))
      * sin(8 * ( z / sqrt(sqr(x) + sqr(y) + sqr(z)) )),
  0.25));`,
  },
  {
    name: 'KVM Holder',
    content: `/**
 * This is a helper I printed to stick my KVM to the bottom
 * of my desk. I printed two of them (inverted) and screwed
 * them to the bottom of my table riser; then I put my kvm
 * in them. The gaps are to avoid blocking ventilation.
 * It's a good example of the power of smooth CSG.
 */
module blob() {
  smooth_union(5) {
    smooth_difference(2) {
      cube([100, 100, 80]);
      translate([0, 0, -15]) cube([200, 15, 20]);
      translate([0, 0, 15]) cube([200, 15, 20]);
    }
    translate([55, 55, -20]) cylinder(6, 100);
    translate([55, 55, 20]) cylinder(6, 100);
  }
}
// used to make the screw hole
module screw_spacer() {
  cylinder(2.2, 100);
  translate([0, -50, 0]) {
    intersection() {
      rotate([0, 0, 180]) cone(10, 10);
      cylinder(5, 20);
    }
    detail(0.2) translate([0, -5, 0]) cylinder(6, 10);
  }
}
// screw_spacer();
detail(10) difference() {
  intersection() {
    blob();
    cube([200, 28, 200]);
  }
  translate([55, 56, -20]) screw_spacer();
  translate([55, 56, 20]) screw_spacer();
  // cut out floor/side
  translate([-13, 39, -23]) cube([120, 100, 120]);
  translate([-50, 0, 0]) cube([120, 100, 120]);
  // remove floor space
  translate([-30, 0, -40]) cube([120, 100, 120]);
  // smoothen back
  translate([0, 0, 90]) cube([200, 100, 100]);
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
