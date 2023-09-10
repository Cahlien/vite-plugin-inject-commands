import { exec } from 'child_process'
import fs from 'fs/promises'
import path from 'path'

/**
 * Read a directory and return absolute paths of its contents.
 *
 * @param {string} directory - The directory path to read.
 * @return {Promise<string[]>} - A promise that resolves with an array of absolute file paths.
 */
async function readDirectory(directory) {
    const files = await fs.readdir(directory)
    return files.map((file) => path.join(directory, file))
}

/**
 * Recursively search directories to find all executables.
 *
 * @param {string[]} executableDirectories - List of directories to search for executables.
 * @param {string[]} [fileList] - Optional list to accumulate found executables.
 * @return {Promise<string[]>} - A promise that resolves with a list of found executables.
 */
async function findExecutables(executableDirectories, fileList = []) {
    for (const directory of executableDirectories) {
        const files = await readDirectory(directory)

        for (const file of files) {
            const fileStat = await fs.stat(file)
            if (fileStat.isDirectory()) {
                await findExecutables([file], fileList)
            } else if (path.extname(file) === '.py') {
                fileList.push(file)
            }
        }
    }
    return fileList
}

/**
 * Execute a shell command directly.
 *
 * @param {string} executableToRun - The executable file to run.
 * @param {string[]} args - The arguments to pass to the executable.
 * @param {string} command - The actual command to run.
 * @param hookArgs - The arguments passed by the hook.
 * @return {Promise<string>} - A promise that resolves with the standard output or rejects with an error message.
 */
async function runShellCommand(executableToRun, args, command, ...hookArgs) {
    return new Promise((resolve, reject) => {
        const hookArgsStr = hookArgs.map(arg => {
            if (typeof arg === 'object') {
                return JSON.stringify(arg);
            }
            return arg;
        }).join(' ');

        const commandString = `${command} ${args ? args.join(' ') : ''} ${hookArgsStr}`;

        exec(commandString, (error, stdout, stderr) => {
            if (error) {
                reject(`Error: ${error}, stderr: ${stderr}`)
            } else {
                resolve(stdout)
            }
        })
    })
}

/**
 * Execute a command using an executor like Python, Node, etc.
 *
 * @param {string} executor - The executor to use (e.g., "python", "node").
 * @param {string} executableToRun - The executable to run.
 * @param {string[]} args - The arguments to pass to the executable.
 * @param hookArgs - The arguments passed by the hook.
 * @return {Promise<string>} - A promise that resolves with the standard output or rejects with an error message.
 */
async function runExecutableCommand(executor, executableToRun, args, ...hookArgs) {
    return new Promise((resolve, reject) => {
        const hookArgsStr = hookArgs.map(arg => {
            if (typeof arg === 'object') {
                return JSON.stringify(arg);
            }
            return arg;
        }).join(' ');

        const commandString = `${executor} ${executableToRun} ${args ? args.join(' ') : ''} ${hookArgsStr}`;


        exec(commandString, (error, stdout, stderr) => {
            if (error) {
                reject(`Error: ${error}, stderr: ${stderr}`)
            } else {
                resolve(stdout)
            }
        })
    })
}

/**
 * The main execution function for running commands.
 *
 * @param {Object[]} executables - List of executables to run, each being an object with `command`, `args`, and `executor`.
 * @param {string[]} directoriesToSearch - Directories where to search for the executables.
 * @param hookArgs - The arguments passed by the hook.
 */
async function execute(executables, directoriesToSearch, hookArgs) {
    const foundExecutables = await findExecutables(directoriesToSearch)

    for (const { command, args, executor } of executables) {
        const executableToRun = foundExecutables.find((executable) => executable.endsWith(command))

        if (executor === undefined || executor === null || !executor) {
            try {
                const stdout = await runShellCommand(executableToRun, args, command, executor, ...hookArgs)
                console.log(stdout)
            } catch (error) {
                console.error(error)
            }
        } else if (executableToRun) {
            try {
                const stdout = await runExecutableCommand(executor, executableToRun, args, command, ...hookArgs)
                console.log(stdout)
            } catch (error) {
                console.error(error)
            }
        } else {
            console.error(`Command ${command} not found.`)
        }
    }
}

/**
 * Vite plugin to inject commands.
 *
 * @param {Object} [options] - The options for the plugin.
 * @param {string[]} [options.paths] - Paths to search for commands, scripts, and executables.
 * @param {Object} [options.hooks] - Hooks and their corresponding script data.
 * @return {Object} - The Vite plugin object.
 */
export default function InjectCommands(options = {}){
    if (typeof options !== 'object') {
        throw new Error('Options must be an object')
    }

    const { paths = ['./'], ...hooks } = options
    if (!paths || paths.length === 0) {
        throw new Error('You must specify at least one directory to search for scripts.')
    }

    const hookMap = {}

    for (const [hook, scriptData] of Object.entries(hooks)) {
        hookMap[hook] = async (...hookArgs) => {
            console.log("hookArgs:", hookArgs);
            await execute(scriptData, paths, hookArgs);
        };
    }

    return {
        name: 'inject-commands',
        ...hookMap
    }
}
