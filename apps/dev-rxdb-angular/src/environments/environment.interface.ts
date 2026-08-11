import { EnvironmentProviders, ModuleWithProviders, Provider, Type } from '@angular/core';

type EnvironmentImport = Type<unknown> | ModuleWithProviders<unknown> | EnvironmentImport[];

export interface ENV {
  production: boolean;
  imports: EnvironmentImport[];
  providers: Array<Provider | EnvironmentProviders>;
}
