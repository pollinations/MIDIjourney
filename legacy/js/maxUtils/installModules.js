const { max } = require("./max");


// run `npm install` in the current directory if node_modules doesn't exist

const fs = require('fs');
const path = require('path');

const nodeModulesPath = path.join(__dirname,'..', 'node_modules');
max.post(`nodeModulesPath: ${nodeModulesPath}`);
if (true || !fs.existsSync(nodeModulesPath)) {
    max.post('Installing node modules...');
    const { exec } = require('child_process');
    exec('npm install', (err, stdout, stderr) => {
        if (err) {
            max.post(`Error installing dependencies: ${err}`);
            return;
        }
        max.post(`stdout: ${stdout}`);
        max.post(`stderr: ${stderr}`);
        max.outlet('done')
    });
}
else {
    max.post('node_modules exists. Dont need to install');
    max.outlet('done')
}