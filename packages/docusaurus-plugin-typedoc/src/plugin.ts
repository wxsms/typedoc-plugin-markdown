import { LoadContext, Plugin } from '@docusaurus/types';
import * as fs from 'fs';
import * as path from 'path';
import { Application, NavigationItem } from 'typedoc';
import { DocsaurusFrontMatterComponent } from './components/front-matter-component';
import { MdxComponent } from './components/mdx-component';
import { LoadedContent, PluginOptions } from './types';

const DEFAULT_PLUGIN_OPTIONS: PluginOptions = {
  inputFiles: [],
  docsRoot: 'docs',
  out: 'api',
  entryFileName: 'index',
  hideBreadcrumbs: true,
  skipSidebar: false,
  sidebar: {
    parentCategory: 'none',
    fullNames: false,
  },
};

const app = new Application();

export default function pluginDocusaurus(
  context: LoadContext,
  pluginOptions: Partial<PluginOptions>,
): Plugin<LoadedContent> {
  const { siteDir } = context;

  const options = { ...DEFAULT_PLUGIN_OPTIONS, ...pluginOptions };

  const inputFiles = options.inputFiles;
  const sidebar = options.skipSidebar ? null : options.sidebar;
  const docsRoot = path.resolve(siteDir, options.docsRoot);
  const outFolder = options.out !== undefined ? options.out : 'api';
  const out = docsRoot + (outFolder ? '/' + outFolder : '');

  // remove docusaurus props (everything else is passed to renderer)
  delete options.id;
  delete options.sidebar;
  delete options.skipSidebar;
  delete options.inputFiles;
  delete options.out;
  delete options.docsRoot;

  return {
    name: 'docusaurus-plugin-typedoc',

    async loadContent() {
      // re-compiling will cause an infinate render loop with dev server
      if (app.renderer.theme) {
        return;
      }

      app.renderer.addComponent(
        'docusaurus-frontmatter',
        new DocsaurusFrontMatterComponent(app.renderer, sidebar),
      );

      app.renderer.addComponent(
        'docusaurus-mdx',
        new MdxComponent(app.renderer),
      );

      // bootstrap
      app.bootstrap({
        plugin: ['typedoc-plugin-markdown'],
        ...options,
      });

      // render project
      const project = app.convert(app.expandInputFiles(inputFiles));

      app.generateDocs(project, out);
      return {
        app,
        project,
      };
    },

    async contentLoaded({ content }) {
      const { app, project } = content;

      const sidebarPath = path.resolve(siteDir, 'sidebars.js');
      if (sidebar && content) {
        const theme = app.renderer.theme as any;
        const navigation = theme.getNavigation(project);
        const sidebarContent = getSidebarJson(
          navigation,
          outFolder,
          sidebar.parentCategory,
        );
        writeSideBar(sidebarContent, sidebarPath, options.logger !== 'none');
      }
    },
  };
}

function getSidebarJson(
  navigation: NavigationItem,
  outFolder: string,
  parentCategory: string,
) {
  const navJson = [];

  navigation.children.forEach((navigationItem) => {
    if (navigationItem.url && navigationItem.children.length === 0) {
      navJson.push(getUrlKey(outFolder, navigationItem.url));
    } else {
      const category = {
        type: 'category',
        label: navigationItem.title,
        items: navigationItem.children.map((navItem) => {
          const url = getUrlKey(outFolder, navItem.url);
          if (navItem.children.length > 0) {
            const childGroups = navItem.children.map((child) => {
              return {
                type: 'category',
                label: child.title,
                items: child.children.map((c) => getUrlKey(outFolder, c.url)),
              };
            });
            return {
              type: 'category',
              label: navItem.title,
              items: [url, ...childGroups],
            };
          }
          return url;
        }),
      };
      navJson.push(category);
    }
  });

  if (parentCategory) {
    return {
      typedocSidebar: [
        { type: 'category', label: parentCategory, items: navJson },
      ],
    };
  }

  return { typedocSidebar: navJson };
}

function getUrlKey(outFolder: string, url: string) {
  const urlKey = url.replace('.md', '');
  return outFolder ? outFolder + '/' + urlKey : urlKey;
}

function writeSideBar(navigationJson: any, sidebarPath: string, log: boolean) {
  let jsonContent: any;
  if (!fs.existsSync(sidebarPath)) {
    jsonContent = JSON.parse('{}');
  } else {
    jsonContent = require(sidebarPath);
  }

  jsonContent = Object.assign({}, jsonContent, navigationJson);
  try {
    fs.writeFileSync(
      sidebarPath,
      'module.exports = ' + JSON.stringify(jsonContent, null, 2) + ';',
    );
    if (log) {
      console.log(
        `[docusaurus-plugin-typedoc] sidebar updated at ${sidebarPath}`,
      );
    }
  } catch (e) {
    console.log(
      `[docusaurus-plugin-typedoc] failed to update sidebar at ${sidebarPath}`,
    );
  }
}
