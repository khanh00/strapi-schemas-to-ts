import type { Core } from '@strapi/strapi';
import fs from 'fs';
import path from 'path';
import { CommonHelpers } from './commonHelpers';
import { Logger } from './logger';

export class FileHelpers {
  public static normalizeWithoutTrailingSeparator(folderPath: string): string {
    folderPath = path.normalize(folderPath);
    if (folderPath.endsWith(path.sep)) {
      folderPath = folderPath.slice(0, -1);
    }

    return folderPath;
  }

  public static ensureFolderPathExistRecursive(srcFolderPath: string, ...subfolders: string[]): string {
    let folder = srcFolderPath;
    for (const subfolder of subfolders) {
      folder = path.join(folder, subfolder);
      if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder);
      }
    }

    return folder;
  }

  public static folderExists(folderPath: string): boolean {
    try {
      return fs.statSync(folderPath).isDirectory();
    } catch (err) {
      return false;
    }
  }


  public static fileExists(filePath: string): boolean {
    try {
      return fs.statSync(filePath).isFile();
    } catch {
      return false;
    }
  }

  public static writeInterfaceFile(folderPath: string, fileName: string, interfacesFileContent: string, logger: Logger): string {
    let writeFile = true;
    const destinationPath: string = path.join(folderPath, fileName);
    if (FileHelpers.fileExists(destinationPath)) {
      const fileContent: string = fs.readFileSync(destinationPath, 'utf8');
      if (fileContent === interfacesFileContent) {
        logger.debug(`File ${destinationPath} is up to date.`);
        writeFile = false;
      }
    }

    if (writeFile) {
      logger.debug(`Writing file ${destinationPath}`);
      fs.writeFileSync(destinationPath, interfacesFileContent, 'utf8');
    }

    return destinationPath;
  }

  public static getRelativePath(fromPath: string, toPath: string): string {
    let stat = fs.statSync(fromPath);
    if (stat.isDirectory()) {
      // path.relative works better with file paths, so we add an unexisting file to the route
      fromPath += '/.dumbFile.txt';
    }

    stat = fs.statSync(toPath);
    if (stat.isDirectory()) {
      toPath += '/.dumbFile.txt';
    }

    const relativePath = path.relative(path.dirname(fromPath), path.dirname(toPath));
    return relativePath === '' ? './' : relativePath;
  }

  public static deleteUnnecessaryGeneratedInterfaces(strapiDirectories: Core.StrapiDirectories, logger: Logger, filesToKeep?: string[]) {
    filesToKeep = filesToKeep ?? [];

    // Array of exact paths to exclude
    const excludedPaths: string[] = [
      path.join(strapiDirectories.app.root, 'node_modules'),
      path.join(strapiDirectories.app.root, 'public'),
      path.join(strapiDirectories.app.root, 'database'),
      path.join(strapiDirectories.app.root, 'dist'),
      path.join(strapiDirectories.app.src, 'plugins'),
      path.join(strapiDirectories.app.src, 'admin'),
    ];
    logger.verbose('excludedPaths', excludedPaths);

    // Function to recursively search for files
    function searchFiles(dir: string): void {
      logger.verbose('Looking for files to delete in ', path.resolve(dir));

      // Skip the directory if it's in the excluded paths or begins with '.' (.git, .cache, .vscode...)
      if (excludedPaths.includes(path.resolve(dir)) || path.basename(dir).startsWith('.')) {
        return;
      }

      const files: string[] = fs.readdirSync(dir);

      for (const file of files) {
        const filePath: string = path.join(dir, file);
        const stat: fs.Stats = fs.statSync(filePath);

        if (stat.isDirectory()) {
          searchFiles(filePath); // Recursively search in sub-directory
        } else if (filesToKeep.includes(filePath)) {
          return;
        } else if (path.extname(file) === '.ts') {
          checkAndDeleteFile(filePath);
        }
      }
    }

    // Function to check the first line of the file and delete if it matches
    function checkAndDeleteFile(filePath: string): void {
      const firstLine: string = fs.readFileSync(filePath, 'utf8').split('\n')[0];
      if (CommonHelpers.compareIgnoringLineBreaks(firstLine, CommonHelpers.headerComment)) {
        fs.unlinkSync(filePath); // Delete the file
        logger.debug(`Deleted: ${filePath}`);
      }
    }

    // Start the search
    searchFiles(strapiDirectories.app.root);
  }

  public static buildStrapiDirectoriesFromRootPath(strapiRootPath: string): Core.StrapiDirectories {
    strapiRootPath = this.normalizeWithoutTrailingSeparator(strapiRootPath);
    const srcPath: string = path.join(strapiRootPath, 'src');
    return {
      dist: {
        root: path.join(strapiRootPath, "dist"),
        src: undefined,
        api: undefined,
        components: undefined,
        extensions: undefined,
        policies: undefined,
        middlewares: undefined,
        config: undefined,
      },
      app: {
        root: strapiRootPath,
        src: srcPath,
        api: path.join(srcPath, "api"),
        components: path.join(srcPath, "components"),
        extensions: path.join(srcPath, "extensions"),
        policies: path.join(srcPath, "policies"),
        middlewares: path.join(srcPath, "middlewares"),
        config: path.join(strapiRootPath, "config"),
      },
      static: {
        public: path.join(strapiRootPath, "public"),
      }
    }
  }

  public static generateIndexFilesRecursively(destinationPaths: { commons?: string, apis?: string, components?: string, extensions?: string }, logger: Logger): void {
    if (destinationPaths.commons) {
      this.generateIndexFilesForPath(destinationPaths.commons, logger);
    }
    if (destinationPaths.apis) {
      this.generateIndexFilesForPath(destinationPaths.apis, logger);
    }
    if (destinationPaths.components) {
      this.generateIndexFilesForPath(destinationPaths.components, logger);
    }
    if (destinationPaths.extensions) {
      this.generateIndexFilesForPath(destinationPaths.extensions, logger);
    }
  }

  private static generateIndexFilesForPath(rootPath: string, logger: Logger): void {
    try {
      // Process subdirectories first
      const items = fs.readdirSync(rootPath);
      items.forEach(item => {
        const fullPath = path.join(rootPath, item);
        if (fs.statSync(fullPath).isDirectory()) {
          this.generateIndexFilesForPath(fullPath, logger);
        }
      });

      // Generate index file for current directory
      this.generateIndexFile(rootPath, logger);
    } catch (error) {
      logger.error(`Error processing directory ${rootPath}: ${error}`);
      throw error;
    }
  }

  private static generateIndexFile(folderPath: string, logger: Logger): void {
    try {
      const files = fs.readdirSync(folderPath);
      const exports: string[] = [];

      // Process all items in the directory
      files.forEach(file => {
        const fullPath = path.join(folderPath, file);
        const stats = fs.statSync(fullPath);
        
        if (stats.isDirectory()) {
          if (fs.existsSync(path.join(fullPath, 'index.ts'))) {
            exports.push(`export * from './${file}';`);
          }
        } else if (
          file !== 'index.ts' && 
          (file.endsWith('.ts') || file.endsWith('.tsx')) &&
          !file.endsWith('.d.ts')
        ) {
          const baseName = path.basename(file, path.extname(file));
          exports.push(`export * from './${baseName}';`);
        }
      });

      // Only create index file if there are exports
      if (exports.length > 0) {
        const indexContent = exports.join('\n') + '\n';
        const indexPath = path.join(folderPath, 'index.ts');
        fs.writeFileSync(indexPath, indexContent);
        logger.verbose(`Generated index file at ${indexPath}`);
      }
    } catch (error) {
      logger.error(`Error generating index file for ${folderPath}: ${error}`);
      throw error;
    }
  }
}