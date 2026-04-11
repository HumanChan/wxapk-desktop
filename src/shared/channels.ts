export const IPC_CHANNELS = {
  cancelJob: 'wxapkg:cancel-job',
  jobEvent: 'wxapkg:job-event',
  openPath: 'wxapkg:open-path',
  pickInput: 'wxapkg:pick-input',
  pickOutputDir: 'wxapkg:pick-output-dir',
  scanDefaultRoot: 'wxapkg:scan-default-root',
  startUnpack: 'wxapkg:start-unpack',
} as const;
