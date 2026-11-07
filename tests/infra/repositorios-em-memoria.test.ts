import { criarRepositoriosEmMemoria } from '../../src/infra/memoria/repositorios-em-memoria.js';
import { contratoDeRepositorios } from './contrato-de-repositorios.js';

contratoDeRepositorios('em memória', async () => criarRepositoriosEmMemoria());
