import simpleGit, {SimpleGit, SimpleGitOptions} from "simple-git";
import * as fs from "fs";
import clc from "cli-color";
// @ts-ignore
import Jetty from "jetty";

const jetty = new Jetty(process.stdout);

main();

type DirectoryType = {
    name: string,
    path: string,
    checked?: boolean,
    clean?: boolean,
    synced?: boolean,
    error?: boolean,
    isGit?: boolean,
    seen?: boolean,
    errorMsg?: string,
    behind?: number,
    ahead?: number,
}

async function main() {
    let args = process.argv;
    let path = ".";
    let maxConcurrent = 16;
    let onlyUnclean = false;
    if (args.indexOf("-p") >= 0) {
        path = args[args.indexOf("-p") + 1] ?? '.';
    }
    if (args.indexOf("-c") >= 0) {
        maxConcurrent = Number(args[args.indexOf("-p") + 1] ?? 16);
        if(!isFinite(maxConcurrent))maxConcurrent = 16;
    }
    if (args.indexOf("-u") >= 0) {
        onlyUnclean = true;
    }

    console.log(clc.cyan("Directories:"));

    let directories = readDirectories(path);
    printResultsDetails(directories,undefined,undefined,onlyUnclean);
    await checkDirs(directories,maxConcurrent,onlyUnclean);
}

async function checkDirs(directories: DirectoryType[], maxAsync: number, onlyUnclean:boolean) {
    let totalChecked = 0;
    let startTime = +new Date();

    async function dirTask(i:number){
        directories[i] = await checkDir(directories[i]);
        printResultsDetails(directories, directories[i], directories[i - 1],onlyUnclean);
        totalChecked++;
    }

    let asyncTasks = [];
    for (let i = 0; i < directories.length; i++) {
        if(asyncTasks.length<maxAsync){
            asyncTasks.push(dirTask(i));
        }else{
            await asyncTasks.pop();
            asyncTasks.push(dirTask(i));
        }
    }

    for (const task of asyncTasks) {
        await task;
    }
    
    console.log(clc.cyan("Total checked: ")+clc.yellow(totalChecked));
    console.log(clc.cyan("Time taken: ")+clc.yellow(((+new Date() - startTime)/1000)+"s"));
}

async function checkDir(dir: DirectoryType): Promise<DirectoryType> {
    const options: Partial<SimpleGitOptions> = {
        baseDir: dir.path,
        maxConcurrentProcesses: 1,
        trimmed: false,
    };
    try {
        const git: SimpleGit = simpleGit(options);
        if (await git.checkIsRepo()) {
            dir.isGit = true;
            let fetchResult = await git.fetch();
            let statusResult = await git.status();
            dir.clean = statusResult.isClean();
            dir.synced = statusResult.ahead <= 0 || statusResult.behind <= 0;
            dir.behind = statusResult.behind;
            dir.ahead = statusResult.ahead;
        } else {
            dir.isGit = false;
        }
    } catch (e) {
        dir.error = true;
        dir.errorMsg = String(e);
    }
    dir.checked = true;
    return dir;
}

function readDirectories(path: string): DirectoryType[] {
    let files = fs.readdirSync(path, {withFileTypes: true});
    let directories = files.filter((file) => {
        return file.isDirectory();
    })
    return directories.map((dir) => {
        return {name: dir.name, status: "unchecked", path: path + "/" + dir.name};
    });
}

function printResultsDetails(directories: DirectoryType[], checking?: DirectoryType, prev?: DirectoryType, onlyUnclean?:boolean) {
    directories.forEach(dir => {
        if (dir.checked && !dir.seen) {
            let color = getStatusColor(dir);
            let checked = directories.reduce((prev,dir)=>{
                if(dir.checked)return prev+1;
                return prev;
            },0);
            let progressText = clc.green(`[${checked}/${directories.length}]`)

            if(onlyUnclean && (!dir.isGit || (dir.clean && dir.synced))){

            } else if (!dir.isGit) {
                console.log(`${progressText} ${clc.blue(dir.name)} - ${color(getStatus(dir))}: isGit:${dir.isGit}`);
            } else if (dir.error) {
                console.log(`${progressText} ${clc.blue(dir.name)} - ${color(getStatus(dir))}: isGit:${dir.isGit}, Error: ${dir.errorMsg}`);
            } else if ((dir.behind ?? 0 > 0) || (dir.ahead ?? 0 > 0)) {
                console.log(`${progressText} ${clc.blue(dir.name)} - ${color(getStatus(dir))}: isGit:${dir.isGit}, Clean: ${dir.clean}, Ahead: ${dir.ahead ?? 0}, Behind: ${dir.behind ?? 0}`);
            } else {
                console.log(`${progressText} ${clc.blue(dir.name)} - ${color(getStatus(dir))}: isGit:${dir.isGit}, Clean: ${dir.clean}, Synced: ${dir.synced}`);
            }
            dir.seen = true;
        }
    })


}

function getStatusColor(dir: DirectoryType) {
    if (!dir.checked) return clc.blue;
    if (!dir.isGit) return clc.black;
    if (dir.error) return clc.red;
    if (dir.synced && dir.clean) return clc.green;
    if (dir.clean) return clc.cyan;
    return clc.yellow;
}

function getStatus(dir: DirectoryType) {
    if (!dir.isGit) return "Directory is not git repository";
    if (dir.error) return "Unexpected error occured";
    if (dir.synced && dir.clean) return "Repository is Synced";
    if (dir.clean) return "Repository tree is clean";
    return "Repository tree is not clean"
}