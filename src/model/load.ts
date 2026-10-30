import { parseGLTF } from './gltf';
import { buildPrimitive, parseOBJ, parseSTL, PRIMITIVES, type MeshData } from './mesh';
import { buildTextMesh, isTextModel } from './text';

export const MODEL_EXTENSIONS = ['.glb', '.gltf', '.obj', '.stl'];
export const BUILTIN_MODELS = Object.keys(PRIMITIVES);

export const isModelFile = (name: string) => MODEL_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

/** Parse a model file by extension. Built-in primitives are named "@sphere", "@knot", …; 3D text "@text:<font>/<text>". */
export async function parseModel(name: string, data?: ArrayBuffer): Promise<MeshData> {
  if (isTextModel(name)) return buildTextMesh(name);
  if (name.startsWith('@')) return buildPrimitive(name);
  if (!data) throw new Error(`no data for ${name}`);
  const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
  switch (ext) {
    case '.glb':
    case '.gltf': return parseGLTF(name, data);
    case '.obj': return parseOBJ(name, new TextDecoder().decode(data));
    case '.stl': return parseSTL(name, data);
    default: throw new Error(`unsupported model format "${ext}" (use ${MODEL_EXTENSIONS.join(', ')})`);
  }
}
