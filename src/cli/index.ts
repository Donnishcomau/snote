import './quiet-warnings';
import './terminal-env';
import { main } from './main';
main(process.argv.slice(2)).then((code) => process.exit(code));
