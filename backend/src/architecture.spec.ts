// Like Spring Modulith's ApplicationModules.verify(): modules talk only through index.ts, without cycles
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.dirname(fileURLToPath(import.meta.url));

const MODULES = [
  'auth',
  'users',
  'groups',
  'tasks',
  'calendar',
  'notifications',
  'stats',
  'mail',
  'health',
] as const;

const SHARED = ['common', 'config', 'db', 'logger'] as const;

type Area = (typeof MODULES)[number] | (typeof SHARED)[number] | 'root';

interface Import {
  from: string;
  to: string;
}

function areaOf(file: string): Area {
  const [first] = path.relative(SRC, file).split(path.sep);
  return [...MODULES, ...SHARED].find((area) => area === first) ?? 'root';
}

function isModule(area: Area): area is (typeof MODULES)[number] {
  return MODULES.some((module) => module === area);
}

const isSchema = (file: string): boolean => file.endsWith('.schema.ts');
const isIndex = (file: string): boolean => path.basename(file) === 'index.ts';
const relative = (file: string): string => path.relative(SRC, file).split(path.sep).join('/');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    // Tests may reach into internals of the module they test
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.spec.ts') ? [full] : [];
  });
}

/** `./x.js` is compiled from x.ts or x.tsx */
function sourcePath(target: string): string {
  const ts = target.replace(/\.js$/, '.ts');
  return existsSync(ts) ? ts : `${ts}x`;
}

const IMPORT = /(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;

const imports: Import[] = sourceFiles(SRC).flatMap((file) =>
  [...readFileSync(file, 'utf8').matchAll(IMPORT)].map((match) => ({
    from: file,
    to: sourcePath(path.resolve(path.dirname(file), match[1] ?? '')),
  })),
);

function describeImport({ from, to }: Import): string {
  return `${relative(from)} → ${relative(to)}`;
}

/** Module A may use module B only through B/index.ts; schema files may reference other tables */
function isAllowed({ from, to }: Import): boolean {
  const source = areaOf(from);
  const target = areaOf(to);
  if (source === target || !isModule(target)) return true;
  if (isIndex(to)) return source !== 'common' && source !== 'config' && source !== 'logger';
  // Foreign keys between modules: schema → schema, and the db layer aggregating all tables
  if (isSchema(to)) return isSchema(from) || source === 'db';
  return false;
}

function moduleGraph(): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>(MODULES.map((module) => [module, new Set()]));
  for (const { from, to } of imports) {
    const source = areaOf(from);
    const target = areaOf(to);
    // Schema references are table foreign keys, not code dependencies
    if (isModule(source) && isModule(target) && source !== target && !isSchema(from)) {
      graph.get(source)?.add(target);
    }
  }
  return graph;
}

function findCycle(graph: Map<string, Set<string>>): string[] | null {
  const visiting: string[] = [];
  const done = new Set<string>();
  const visit = (node: string): string[] | null => {
    const index = visiting.indexOf(node);
    if (index !== -1) return [...visiting.slice(index), node];
    if (done.has(node)) return null;
    visiting.push(node);
    for (const next of graph.get(node) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    visiting.pop();
    done.add(node);
    return null;
  };
  for (const node of graph.keys()) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return null;
}

describe('module architecture', () => {
  it('finds the source files', () => {
    expect(imports.length).toBeGreaterThan(100);
  });

  it.each(MODULES)('%s exposes a public API in index.ts', (module) => {
    expect(existsSync(path.join(SRC, module, 'index.ts'))).toBe(true);
  });

  it('uses other modules only through their index.ts', () => {
    const violations = imports.filter((entry) => !isAllowed(entry)).map(describeImport);
    expect(violations).toEqual([]);
  });

  it('keeps the shared kernel independent of the modules', () => {
    const violations = imports
      .filter(
        ({ from, to }) =>
          ['common', 'config', 'logger'].includes(areaOf(from)) && isModule(areaOf(to)),
      )
      .map(describeImport);
    expect(violations).toEqual([]);
  });

  it('detects a cycle when there is one', () => {
    const graph = new Map([
      ['groups', new Set(['tasks'])],
      ['tasks', new Set(['groups'])],
    ]);
    expect(findCycle(graph)).toEqual(['groups', 'tasks', 'groups']);
  });

  it('has no cycles between modules', () => {
    expect(findCycle(moduleGraph())).toBeNull();
  });
});
