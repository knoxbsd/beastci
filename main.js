#!/usr/bin/env node
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function main(workspace, command, username, sshkey) {
    const keyMaterial = sshkey.replace(/[\n\r]+/g, '\n');
    fs.writeFileSync('sshkey', keyMaterial, {encoding: 'utf8', mode: 0o600, flush: true});
    const jailName = generateJailName();
    const keyPair = generateKeyPair(jailName);
    const jailIP = createJail(jailName, keyPair.pub, username);
    rsyncJail(workspace, jailIP, keyPair.key);
    jailTask(jailIP, path.basename(workspace), keyPair.key, command);
}

function createJail(name, pubkey, username) {
    const pubkeyMaterial = fs.readFileSync(pubkey, 'utf8');
    const result = spawnSync("ssh", [
        '-i', 'sshkey',
        '-o', 'StrictHostKeyChecking=no',
        `${username}@freebsd.number1engineering.com`,
        'sudo', 'jail-agent', 'create', name
    ], {input: pubkeyMaterial, encoding: 'utf8'});
    return result.stdout.trimEnd();
}

function destroyJail(name, username) {
    const result = spawnSync("ssh", [
        '-i', 'sshkey',
        '-o', 'StrictHostKeyChecking=no',
        `${username}@freebsd.number1engineering.com`,
        'sudo', 'jail-agent', 'destroy', name
    ]);
}

function generateJailName() {
    return crypto.randomUUID();
}

function generateKeyPair(name) {
    const path = `${name}.ssh`;
    spawnSync("ssh-keygen", [
        '-t', 'ed25519',
        '-C', name,
        '-N', '',
        '-f', path
    ]);
    return {
        key: path,
        pub: `${path}.pub`
    };
}

function rsyncJail(source, jailIP, sshkey) {
    spawnSync('rsync', [
        '-avz', '--no-owner', '--no-group',
        '-e', `ssh -i ${sshkey} -o StrictHostKeyChecking=no`,
        '--exclude', '.git',
        '--exclude', 'target',
        '--exclude', '*/target',
        '--exclude', '*/.venv',
        '--exclude', '*.swp',
        `${source}`, `root@[${jailIP}]:~/`
    ]);
}

function jailTask(jailIP, workdir, sshkey, task) {
    spawnSync('ssh', [
        '-i', sshkey,
        '-o', 'StrictHostKeyChecking=no',
        `root@${jailIP}`,
        '/usr/local/bin/bash'
    ], {input: `cd ${workdir}; ` + task, encoding: 'utf8', stdio: ['pipe', 'inherit', 'inherit']});
}

module.exports = {
    createJail,
    destroyJail,
    generateJailName,
    generateKeyPair,
    jailTask
}

if (process.env.GITHUB_ACTIONS == "true") {
    main(
        process.env.GITHUB_WORKSPACE,
        process.env.INPUT_COMMAND,
        process.env.GITHUB_ACTOR,
        process.env.INPUT_SSHKEY
    );
}
