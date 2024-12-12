import { readFileSync } from 'fs';
import { parse } from './parser';
import { Context } from './types';
import { evalCAD } from './builtins';

const filename = process.argv[2];
if (!filename) {
  console.error('Usage: node cli.ts <filename>');
  process.exit(1);
}

try {
  const source = readFileSync(filename, 'utf-8');
  const nodes = parse(source);
  const context = new Context();
  
  // Evaluate each node
  nodes.forEach(node => {
    try {
      evalCAD(node, context);
    } catch (e) {
      if (e instanceof Error) {
        console.error(e.message);
        process.exit(1);
      }
      throw e;
    }
  });
  
  console.log('All assertions passed!');
} catch (e) {
  if (e instanceof Error) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}