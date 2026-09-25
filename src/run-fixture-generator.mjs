// A minimal real generator, used only by run.spec.ts to prove runGenerator()
// actually registers and executes a caller-supplied RegistryEntry[] (not
// just the default REGISTRY) via a real Yeoman environment.register()/run()
// round trip — not something any real namespace resolves to.
import { CoreGenerator } from '@sektek/generator';

export default class RunFixtureGenerator extends CoreGenerator {
  taskWriting() {
    this.fs.write(this.destinationPath('marker.txt'), 'fixture generator ran');
  }
}
