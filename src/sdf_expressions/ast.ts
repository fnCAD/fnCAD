import { Interval } from '../interval';
import { GLSLContext } from './glslgen';
import { Vector3 } from 'three';

export type Content = null | {
  category: 'face' | 'edge' | 'outside' | 'inside',
};

export interface Node {
  evaluate(point: Vector3): number;
  evaluateInterval(x: Interval, y: Interval, z: Interval): Interval;
  evaluateContent(x: Interval, y: Interval, z: Interval): Content;
  toGLSL(context: GLSLContext): string;
}
