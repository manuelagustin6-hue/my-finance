// Copia packages/core/src a supabase/functions/_shared/core para que las Edge Functions
// (Deno) usen exactamente la misma lógica que la app. Ejecutar antes de servir o desplegar.
import { cpSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'supabase/functions/_shared/core');
rmSync(target, { recursive: true, force: true });
cpSync(join(root, 'packages/core/src'), target, { recursive: true });
console.log('core sincronizado en', target);
