import { register } from 'node:module'

register(new URL('./demoModuleHooks.js', import.meta.url))
