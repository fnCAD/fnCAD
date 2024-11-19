import { Node } from './types';
import { parse as parseSDFExpression } from '../sdf_expressions/parser';

// Convert OpenSCAD-style module calls to SDF expressions
export function moduleToSDF(node: Node): string {
  if (node.type !== 'ModuleCall') {
    throw new Error(`Expected ModuleCall node, got ${node.type}`);
  }

  const call = node as ModuleCall;

  switch (call.name) {
    case 'cube': {
      const size = call.arguments[0]?.value || 1;
      return `max(max(abs(x) - ${size/2}, abs(y) - ${size/2}), abs(z) - ${size/2})`;
    }

    case 'sphere': {
      const r = call.arguments[0]?.value || 1;
      return `sqrt(x*x + y*y + z*z) - ${r}`;
    }

    case 'translate': {
      const dx = call.arguments[0]?.value || 0;
      const dy = call.arguments[1]?.value || 0;
      const dz = call.arguments[2]?.value || 0;
      const child = moduleToSDF(call.children?.[0]);
      return `translate(${dx}, ${dy}, ${dz}, ${child})`;
    }

    case 'rotate': {
      const rx = call.arguments[0]?.value || 0;
      const ry = call.arguments[1]?.value || 0;
      const rz = call.arguments[2]?.value || 0;
      const child = moduleToSDF(call.children?.[0]);
      return `rotate(${rx}, ${ry}, ${rz}, ${child})`;
    }

    case 'union': {
      if (!call.children?.length) return '0';
      const children = call.children.map(moduleToSDF);
      return `min(${children.join(', ')})`;
    }

    case 'difference': {
      if (!call.children?.length) return '0';
      const children = call.children.map(moduleToSDF);
      // Negate all children after the first one
      const negatedChildren = children.slice(1).map((child: string) => `-(${child})`);
      return `max(${children[0]}, ${negatedChildren.join(', ')})`;
    }

    default:
      throw new Error(`Unknown module: ${call.name}`);
  }
}

// Validate that an SDF expression is well-formed
export function validateSDF(sdfExpr: string): void {
  try {
    parseSDFExpression(sdfExpr);
  } catch (e) {
    throw new Error(`Invalid SDF expression: ${(e as Error).message}`);
  }
}
