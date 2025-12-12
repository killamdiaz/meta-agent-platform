export class AgentRunner {
    launch(spec) {
        const timestamp = new Date().toISOString();
        return {
            timestamp,
            message: `Agent "${spec.name}" scheduled for execution inside sandbox with timeout ${spec.securityProfile.executionTimeout}s.`
        };
    }
}
