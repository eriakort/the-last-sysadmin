'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LSAFeedback = api;
})(typeof window !== 'undefined' ? window : this, function () {
  const make = (category, title, reason, next, confidence = 'high') => ({ category, title, reason, next, confidence });
  function classifyCommandFailure(input = {}) {
    const discipline = input.discipline === 'network' ? 'network' : 'linux';
    const message = String(input.output || '').toLowerCase();
    if (discipline === 'network') {
      if (/incomplete command/.test(message)) return make('syntax','Incomplete command · missing argument','The device recognises the command, but it needs another keyword or value before it can run.','Use ? at the current prompt to discover the required next argument, then enter the complete command.');
      if (/ambiguous command/.test(message)) return make('syntax','Ambiguous command · be specific','The abbreviation matches more than one command or keyword.','Use the full keyword instead of an abbreviation, then retry without changing configuration.');
      if (/invalid input|invalid command|unknown command|unrecognized command/.test(message)) return make('context','Invalid input · syntax or mode','The device does not recognise this command at the current prompt. Network CLIs expose different commands in user, privileged and configuration modes.','Check the prompt suffix and use ? to inspect commands available in this mode; do not assume a configuration command is valid everywhere.');
      if (/not authorized|authorization|insufficient privilege|permission denied/.test(message)) return make('permission','Privilege · access','The current CLI privilege level does not permit this operation.','Check the current privilege level and authenticate through the intended training workflow before retrying.');
      if (/interface.*(not found|does not exist|invalid)|vlan.*(not found|does not exist|invalid)/.test(message)) return make('target-state','Target not found · device state','The interface, VLAN or other named object was not found on the selected device.','Verify the selected device and inspect its existing interfaces or VLANs before referencing the target again.');
      return make('unknown','Command failed · inspect context','The device rejected the command, but the exact cause is not clear from this response. Avoid changing configuration until you inspect the prompt and device state.','Check the selected device and current prompt, then use its command help to confirm which commands are valid in this mode.','low');
    }
    if (/command not found/.test(message)) return make('syntax','Command not found · syntax','The shell could not match the first word to an available command. Linux command names are case-sensitive.','Check spelling and capitalisation with the command reference, or use help to find the correct tool.');
    if (/permission denied|operation not permitted/.test(message)) return make('permission','Permission · access','The current user or file permissions do not allow this action. It does not automatically mean that elevated access is the right fix.','Inspect who you are and the target permissions with whoami and ls -l before changing ownership or access.');
    if (/no such file|cannot access|not found/.test(message)) return make('target-state','Target not found · path','The requested file, directory, service or target could not be located in the current context.','Confirm your location with pwd, then inspect the relevant directory or service name before retrying.');
    if (/is a directory|not a directory/.test(message)) return make('target-state','Wrong target type','The command expected a file or directory of a different type than the one supplied.','Inspect the target with ls -ld and choose an operation that matches its actual type.');
    if (/invalid option|unrecognized option|usage:/.test(message)) return make('syntax','Invalid option · command syntax','The command recognised the tool but rejected its option or argument format.','Read the usage line or run the command with --help; add or change one option at a time.');
    return make('unknown','Command or operation failed','The command did not complete. Read the exact error, then inspect the current system state before trying another change.','Check the command manual and current context, then repeat the original check after one targeted correction.','low');
  }
  function classifyOutcome(input = {}) {
    const effects = Array.isArray(input.sideEffects) ? input.sideEffects.filter(Boolean) : [];
    if (effects.length) return make('side-effect','Unintended side effect','The action changed or affected something beyond the intended task.','Inspect the affected state, identify the extra change, and restore only what the evidence shows is necessary.');
    if (input.commandAccepted && input.configurationValid && input.objectiveMet === false) return make('valid-but-incorrect','Valid configuration · wrong outcome','The command was accepted and the configuration is valid, but it does not satisfy the task objective.','Compare the current configuration with the stated requirement and adjust the smallest relevant setting.');
    if (input.objectiveMet === false) return make('objective-unmet','Objective not yet met','The current state does not satisfy the learning objective, even though no command error was reported.','Inspect the relevant state and compare it with each acceptance condition before making another change.');
    return make('success','Objective verified','The observed state satisfies the requested outcome.','Capture the evidence and continue to the next task.');
  }
  return Object.freeze({ classifyCommandFailure, classifyOutcome });
});
