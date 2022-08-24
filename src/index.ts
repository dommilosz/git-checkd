#!/usr/bin/env node

import simpleGit, {CheckRepoActions, SimpleGit, SimpleGitOptions} from "simple-git";
import * as fs from "fs";
import clc from "cli-color";
import * as Path from "path";

main();

type DirectoryType = {
    name: string,
    path: string,
    location:string,
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

type OptionsType = {
    onlyUnclean: boolean,
    useGitFetch: boolean,
    useGitStatus: boolean,
    path: string,
    maxConcurrent: number,
    recursive:boolean,
    maxDepth:number,
    noColor:boolean,
}

async function main() {
    let args = process.argv;
    let options: OptionsType = {
        maxConcurrent: 4,
        path: ".",
        onlyUnclean: true,
        useGitFetch: true,
        useGitStatus: true,
        recursive:false,
        maxDepth:4,
        noColor:false,
    };
    if (args.indexOf("-p") >= 0) {
        options.path = args[args.indexOf("-p") + 1] ?? '.';
    }
    if (args.indexOf("-c") >= 0) {
        options.maxConcurrent = Number(args[args.indexOf("-p") + 1] ?? 4);
        if (!isFinite(options.maxConcurrent)) options.maxConcurrent = 4;
    }
    if (args.indexOf("-a") >= 0) {
        options.onlyUnclean = false;
    }
    if (args.indexOf("--no-fetch") >= 0) {
        options.useGitFetch = false;
    }
    if (args.indexOf("--no-color") >= 0) {
        options.noColor = true;
    }
    if (args.indexOf("-l") >= 0) {
        options.useGitFetch = false;
        options.useGitStatus = false;
    }
    if (args.indexOf("-r") >= 0) {
        options.recursive = true;
    }
    if (args.indexOf("--max-depth") >= 0) {
        options.maxDepth = Number(args[args.indexOf("--max-depth") + 1] ?? 4);
        if (!isFinite(options.maxDepth)) options.maxDepth = 4;
    }
    if (args.indexOf("-h") >= 0 || args.indexOf("--help") >= 0) {
        console.log(textColor("magentaBright",options)("=====[git-checkd help]====="));
        console.log(textColor("yellowBright",options)("-p")+textColor("cyan",options)("   Set path of search. Default '.'"));
        console.log(textColor("yellowBright",options)("-a")+textColor("cyan",options)("   Show all repositories, even if clean and synced"));
        console.log(textColor("yellowBright",options)("-l")+textColor("cyan",options)("   Only list repositories don't fetch nor read status"));
        console.log(textColor("yellowBright",options)("-r")+textColor("cyan",options)("   Recursive (default depth: 4)"));
        console.log(textColor("yellowBright",options)("-c")+textColor("cyan",options)("   Set recursive depth (default 4)"));
        console.log(textColor("yellowBright",options)("-h")+textColor("cyan",options)("   Don't use colors"));
        console.log(textColor("yellowBright",options)("--help")+textColor("cyan",options)("   Don't fetch, still uses git status."));
        console.log(textColor("yellowBright",options)("--max-depth <depth>")+textColor("cyan",options)("   Set max concurrent tasks at once"));
        console.log(textColor("yellowBright",options)("--no-color")+textColor("cyan",options)("   Shows this help"));
        console.log(textColor("yellowBright",options)("--no-fetch")+textColor("cyan",options)("   Shows this help"));
        console.log(textColor("magentaBright",options)("==========================="));
        return;
    }

    let directories = readDirectories(options);
    console.log(textColor("cyan",options)("Found candidates: ")+textColor("yellowBright",options)(directories.length));
    printResultsDetails(directories, options);
    await checkDirs(directories, options);
}

async function checkDirs(directories: DirectoryType[], options: OptionsType) {
    let totalChecked = 0;
    let startTime = +new Date();

    async function dirTask(i: number) {
        directories[i] = await checkDir(directories[i],options);
        printResultsDetails(directories, options);
        totalChecked++;
    }

    let asyncTasks = [];
    for (let i = 0; i < directories.length; i++) {
        if (asyncTasks.length < (options.maxConcurrent)) {
            asyncTasks.push(dirTask(i));
        } else {
            await asyncTasks.pop();
            asyncTasks.push(dirTask(i));
        }
    }

    for (const task of asyncTasks) {
        await task;
    }

    console.log();

    console.log(`${textColor("cyan",options)('Synced repositories:')} ${textColor("yellowBright",options)(directories.reduce((prev,dir)=>{
       if(dir.clean && dir.synced) return prev+1;
       return prev;
    },0))}`);

    console.log(`${textColor("cyan",options)('Unsynced repositories:')} ${textColor("yellowBright",options)(directories.reduce((prev,dir)=>{
        if(!dir.synced) return prev+1;
        return prev;
    },0))}`);

    console.log(`${textColor("cyan",options)('Unclean repositories:')} ${textColor("yellowBright",options)(directories.reduce((prev,dir)=>{
        if(!dir.clean && dir.isGit) return prev+1;
        return prev;
    },0))}`);

    console.log(`${textColor("cyan",options)('Error repositories:')} ${textColor("yellowBright",options)(directories.reduce((prev,dir)=>{
        if(dir.error) return prev+1;
        return prev;
    },0))}`);

    console.log(textColor("cyan",options)("Total checked: ") + textColor("yellowBright",options)(totalChecked));
    console.log(textColor("cyan",options)("Time taken: ") + textColor("yellowBright",options)(((+new Date() - startTime) / 1000) + "s"));
}

async function checkDir(dir: DirectoryType, options: OptionsType): Promise<DirectoryType> {
    const gitOptions: Partial<SimpleGitOptions> = {
        baseDir: dir.path,
        maxConcurrentProcesses: 1,
        trimmed: false,
    };
    try {
        const git: SimpleGit = simpleGit(gitOptions);
        if (await git.checkIsRepo(CheckRepoActions.IS_REPO_ROOT)) {
            dir.isGit = true;
            if (options.useGitFetch)
                await git.fetch();
            if (options.useGitStatus){
                let statusResult = await git.status();
                dir.clean = statusResult.isClean();
                dir.synced = statusResult.ahead <= 0 && statusResult.behind <= 0;
                dir.behind = statusResult.behind;
                dir.ahead = statusResult.ahead;
            }
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

function _readDirectories(path:string,depthLeft:number):DirectoryType[]{
    depthLeft--;
    let files = fs.readdirSync(path, {withFileTypes: true});
    let directories:DirectoryType[] = files.filter((file) => {
        return file.isDirectory() && file.name !== '.git'
    }).map((dir) => {
        return {name: dir.name, status: "unchecked", path: Path.join(path,dir.name),location:path};
    });
    let newDirectories:DirectoryType[] = [];
    if(depthLeft>0){
        for (const dir of directories) {
            newDirectories.push(..._readDirectories(dir.path,depthLeft-1));
        }
    }
    directories.push(...newDirectories);
    directories = directories.filter(dir=>{
        //console.log(Path.join(dir.path,".git"));
        return fs.existsSync(Path.join(dir.path,".git"));
    })
    return directories;
}

function readDirectories(options: OptionsType): DirectoryType[] {
    return _readDirectories(options.path, options.recursive ? options.maxDepth : 1);
}

function printResultsDetails(directories: DirectoryType[], options: OptionsType) {
    directories.forEach(dir => {
        if (dir.checked && !dir.seen) {
            let repoTxt = formatRepo(dir,options);
            if(repoTxt !== undefined){
                let checked = directories.reduce((prev, dir) => {
                    if (dir.checked) return prev + 1;
                    return prev;
                }, 0);
                let progressText = textColor("green",options)(`[${checked}/${directories.length}]`)
                console.log(`${progressText} ${repoTxt}`);
            }
            dir.seen = true;
        }
    })
}

function formatRepo(dir: DirectoryType,options:OptionsType){
    let base = textColor("blackBright",options)(Path.join(dir.location,"/")) + textColor("blue",options)(dir.name);
    let status = getStatusColor(dir,options)(getStatus(dir));

    let props:{prop:string,value?:any}[] = []

    if(options.onlyUnclean && (!dir.isGit || (dir.clean && dir.synced)))return undefined;

    if(dir.error){
        props.push({prop:"Error",value:dir.errorMsg});
    }else{
        if(!dir.isGit){
            props.push({prop:"isGit",value:dir.isGit});
        }else {
            if((dir.behind ?? 0 > 0) || (dir.ahead ?? 0 > 0)){
                props.push({prop:"Ahead",value:dir.ahead});
                props.push({prop:"Behind",value:dir.behind});
            }
            props.push({prop:"Clean",value:dir.clean});
            props.push({prop:"Synced",value:dir.synced});
        }
    }
    let propsTxt = props.filter(el=>el.value !== undefined).map(el=>`${textColor("greenBright",options)(el.prop)}: ${textColor("magentaBright",options)(el.value)}`).join(" ");

    return `${base} - ${status}: ${propsTxt}`
}

function getStatusColor(dir: DirectoryType,options:OptionsType) {
    if (!dir.checked) return textColor("blue",options);
    if (!dir.isGit) return textColor("black",options);
    if (dir.error) return textColor("red",options);
    if (dir.synced && dir.clean) return textColor("green",options);
    if (dir.clean) return textColor("cyan",options);
    return textColor("yellowBright",options);
}

function getStatus(dir: DirectoryType) {
    if (!dir.isGit) return "Directory is not git repository";
    if (dir.error) return "Unexpected error occured";
    if (dir.synced && dir.clean) return "Repository is Synced";
    if (dir.clean) return "Repository tree is clean";
    return "Repository tree is not clean"
}

function textColor(color:any,options:OptionsType){
    if(options.noColor){
        return (t:any)=>t;
    }
    // @ts-ignore
    return clc[color];
}