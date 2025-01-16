import type { Core } from "@strapi/strapi";
import { PluginConfig } from './models/pluginConfig';
import { pluginName } from './models/pluginName';
import { Converter } from './schemas-to-ts/converter';

export default ({ strapi }: { strapi: Core.Strapi }) => {
  const config: PluginConfig = strapi.config.get(`plugin::${pluginName}`);
  const converter = new Converter(config, strapi.config.info.strapi, strapi.dirs);
  converter.SchemasToTs();
};
