const messages = {
    'tools.direction.tool': 'Agent call',
    'tools.direction.in': 'Received',
    'tools.direction.reply': 'Auto-reply',
    'tools.direction.out': 'Hook sent',
    'tools.direction.test': 'Test',
    'tools.event.messageReceived': 'A message or comment arrives',
    'tools.event.agentReplied': 'An agent answers it',
    'tools.event.agentAction': 'An agent uses the plugin',
    'tools.event.agentFailed': 'Something fails',
    'tools.noAgents': 'This project has no agents yet.',
    'tools.optionalField': '{label} (optional)',
    'tools.errors.toolsLoadFailed': 'The tools could not be loaded.',
    'tools.errors.capabilityFailed': 'The capability could not be changed.',
    'tools.errors.pluginsLoadFailed': 'The plugins could not be loaded.',
    'tools.errors.actionFailed': 'That did not work.',
    'tools.errors.saveFailed': 'The plugin could not be saved.',
    'tools.errors.activityLoadFailed': 'The activity could not be loaded.',
    'tools.mcp.loading': 'Loading the tools.',
    'tools.mcp.summary':
        '{tools} tools in {capabilities} capabilities. An agent can call a tool once it holds the capability above it; everything is off until you grant it.',
    'tools.mcp.agentsTitle': 'Agents that can use these',
    'tools.plugins.loading': 'Loading plugins.',
    'tools.plugins.summary.one':
        '{count} plugin. An agent can use a plugin once you let it; a plugin with an agent under Hooks also answers what comes in.',
    'tools.plugins.summary.other':
        '{count} plugins. An agent can use a plugin once you let it; a plugin with an agent under Hooks also answers what comes in.',
    'tools.plugins.refresh': 'Refresh',
    'tools.plugins.add': 'Add plugin',
    'tools.plugins.empty.title': 'No plugins yet',
    'tools.plugins.empty.description':
        'Connect Telegram, X, Discord, Instagram, a web browser or a webhook, and let your agents post, reply, like and look things up there.',
    'tools.plugins.savedUntested':
        '{name} is saved, but its test did not pass yet. Open Activity to see why.',
    'tools.plugins.savedConnected': '{name} is saved and connected as {account}.',
    'tools.plugins.on': 'On',
    'tools.plugins.off': 'Off',
    'tools.plugins.noUsers': 'No agent may use it yet. Choose who under Modify.',
    'tools.plugins.sendsTo': 'Sends events to',
    'tools.plugins.test': 'Test',
    'tools.plugins.testing': 'Testing…',
    'tools.plugins.works': '{name} works.',
    'tools.plugins.worksAs': '{name} works: {account}.',
    'tools.plugins.testFailed': '{name} did not pass: {error}',
    'tools.plugins.activity': 'Activity',
    'tools.plugins.modify': 'Modify',
    'tools.plugins.remove': 'Remove',
    'tools.plugins.removeTitle': 'Remove {name}?',
    'tools.plugins.removeDescription':
        'Agents lose its tools, it stops answering, and the record of its requests is deleted. Posts it already made stay where they are.',
    'tools.plugins.removeConfirm': 'Remove plugin',
    'tools.health.off': 'Off. Agents cannot use it, and it answers nobody.',
    'tools.health.notConnected': 'Not connected yet. Run Test to check its keys.',
    'tools.health.listening': 'Listening as {account}.',
    'tools.health.listeningAnswered': 'Listening as {account}, answered by {agent}.',
    'tools.health.connected': 'Connected as {account}.',
    'tools.health.connectedAnswered': 'Connected as {account}, answered by {agent}.',
    'tools.stats.week': 'This week',
    'tools.stats.failed': 'Failed',
    'tools.stats.failedOf': '{failures} of {requests}',
    'tools.stats.received': 'Received',
    'tools.stats.lastUsed': 'Last used',
    'tools.stats.never': 'Never',
    'tools.form.titleNew': 'Add a plugin',
    'tools.form.titleEdit': 'Modify {name}',
    'tools.form.description': 'Connect an app the agents can post to, reply on and read from.',
    'tools.form.kind': 'Kind',
    'tools.form.name': 'Name',
    'tools.form.nameHint': 'How agents and this page refer to it.',
    'tools.form.namePlaceholder': '{kind} main',
    'tools.form.namePlaceholderDefault': 'Plugin main',
    'tools.form.secretRemoved': 'Removed when you save.',
    'tools.form.secretSaved': 'Saved as {saved}. Leave it blank to keep it. {hint}',
    'tools.form.hide': 'Hide',
    'tools.form.show': 'Show',
    'tools.form.keep': 'Keep',
    'tools.form.remove': 'Remove',
    'tools.form.on': 'On',
    'tools.form.off': 'Off: agents cannot use it and it does not answer',
    'tools.form.agentsTitle': 'Agents that may use it',
    'tools.form.agentsTools': 'They get {tools}.',
    'tools.form.agentsToolsDefault': 'They get its tools.',
    'tools.form.hooksTitle': 'Hooks',
    'tools.form.hooksDescription':
        'What happens when something arrives, and where events are sent.',
    'tools.form.answeredBy': 'Answered by',
    'tools.form.answeredByNobody': 'Nobody, only record it',
    'tools.form.webhookTitle': 'Webhook address',
    'tools.form.webhookPending': 'The address and its secret appear here once the plugin is saved.',
    'tools.form.verifyToken': 'Verify token',
    'tools.form.secretHeader': 'Secret, sent in the x-nura-secret header',
    'tools.form.forward': 'Forward events to (optional)',
    'tools.form.forwardHintNew':
        'Each event is posted there as JSON, signed in x-nura-signature with a secret shown after saving.',
    'tools.form.forwardHint':
        'Each event is posted there as JSON, signed in x-nura-signature with HMAC-SHA256 of the body and {secret}….',
    'tools.form.cancel': 'Cancel',
    'tools.form.saving': 'Saving and testing…',
    'tools.form.add': 'Add plugin',
    'tools.form.save': 'Save changes',
    'tools.calls.title': 'Activity',
    'tools.calls.description':
        'Every request it made for an agent, everything that arrived through it, the replies it sent and the events it forwarded.',
    'tools.calls.requests': 'Requests',
    'tools.calls.requestsNote': '{day} today · {week} this week',
    'tools.calls.failed': 'Failed',
    'tools.calls.nothingSent': 'Nothing sent yet',
    'tools.calls.failedShare': '{percent}% of requests',
    'tools.calls.received': 'Received',
    'tools.calls.repliesNote': '{replies} answered by an agent',
    'tools.calls.average': 'Average',
    'tools.calls.averageNote': 'Per request that worked',
    'tools.calls.byAction': 'By action',
    'tools.calls.column.action': 'Action',
    'tools.calls.column.kind': 'Kind',
    'tools.calls.column.count': 'Count',
    'tools.calls.column.failed': 'Failed',
    'tools.calls.column.average': 'Average',
    'tools.calls.column.last': 'Last',
    'tools.calls.recent': 'Recent',
    'tools.calls.refresh': 'Refresh',
    'tools.calls.empty': 'Nothing has gone through it yet.',
    'tools.calls.ok': 'OK',
    'tools.calls.failedBadge': 'Failed',
    'tools.calls.status': '{status} · {duration}',
    'tools.calls.noAnswer': 'no answer · {duration}',
    'tools.calls.showDetails': 'Show details',
    'tools.calls.hideDetails': 'Hide details',
    'tools.calls.arrived': 'What arrived',
    'tools.calls.sent': 'Sent',
    'tools.calls.from': 'From',
    'tools.calls.reply': 'Reply',
    'tools.calls.answer': 'Answer',
    'tools.calls.noun': 'requests',
    'tools.help.open': 'What does this allow?',
    'tools.help.examples': 'For example',
    'tools.help.prefs.read.summary':
        'The agent keeps a small notebook for every person it talks to: markdown files such as preferences.md. With this on, it can open that notebook before it answers, so it remembers what it wrote down about the person earlier.',
    'tools.help.prefs.read.example1':
        'Sara once said she likes short answers. A week later the agent reads her notebook and keeps its reply short without being told again.',
    'tools.help.prefs.read.example2':
        'Someone asks "what do you remember about me?" and the agent reads their notebook to answer.',
    'tools.help.prefs.write.summary':
        'Lets the agent write in that notebook: add a line to a file, or write a file again from scratch. Writing does not include reading, so also turn on "May read files" if the agent should use what it wrote.',
    'tools.help.prefs.write.example1':
        'Someone says "call me Ali, not Alireza" and the agent writes that down for next time.',
    'tools.help.prefs.write.example2':
        'The agent notes that a customer is interested in the yearly plan, so it can follow up later.',
    'tools.help.prefs.write.caution':
        'Writing a whole file replaces what was in it, so an agent with this can erase its own notes about a person.',
    'tools.help.conversation.read.summary':
        'An agent normally sees only the last few messages of a chat. This lets it search further back, through everything that person has ever written to it.',
    'tools.help.conversation.read.example1':
        'Someone asks "what was the address I sent you last month?" and the agent searches their old messages to find it.',
    'tools.help.conversation.read.example2':
        'Before answering a complaint, the agent checks whether the same person reported the same problem before.',
    'tools.help.team.read.summary':
        'Lets the agent see the list of everyone who has written to your bots, and read the notes kept about each of them, not only about the person it is talking to right now.',
    'tools.help.team.read.example1':
        'An admin asks "who wrote to the bot today?" and the agent lists them.',
    'tools.help.team.read.example2':
        'Before passing a question on, the agent reads what it knows about the colleague who usually handles it.',
    'tools.help.team.read.caution':
        'It can see information about other people, so give it only to agents that answer your own team.',
    'tools.help.team.write.summary':
        'Lets the agent add notes about any member of the team, not just the person it is talking to. It can only add; it cannot change or delete what is already written.',
    'tools.help.team.write.example1':
        'A manager says "remember that Sara handles refunds" and the agent adds that to Sara\'s notes.',
    'tools.help.team.write.example2':
        "After a meeting, the agent adds each person's follow-up to their notes.",
    'tools.help.team.chat.summary':
        'Lets the agent turn "Chat with model" on or off for someone, so your bots start or stop answering that person. It only works when the person asking is in team.json with at least one role.',
    'tools.help.team.chat.example1':
        'An admin listed in team.json says "stop answering @spammer" and the agent switches that person off.',
    'tools.help.team.chat.example2':
        'A community manager asks the agent to let a new member start chatting with the bot.',
    'tools.help.team.chat.caution':
        'Also turn on "May see the team roster" so the agent can find the person it should switch.',
    'tools.help.roster.read.summary':
        "team.json is your team's contact sheet: names, roles, what each person does and their public handles. With this on, the agent can read it and answer questions about who is who.",
    'tools.help.roster.read.example1':
        'Someone asks "who handles marketing?" and the agent answers from team.json.',
    'tools.help.roster.read.example2':
        'A new member asks how to reach the CTO and gets the public handle listed there.',
    'tools.help.roster.create.summary':
        'Lets the agent add a new person to team.json. It cannot change or remove anyone who is already there.',
    'tools.help.roster.create.example1':
        'An admin says "add Reza as our new designer" and the agent adds him.',
    'tools.help.roster.create.example2':
        'After a new hire introduces themselves, an admin asks the agent to put them on the team.',
    'tools.help.roster.update.summary':
        'Lets the agent change what team.json says about someone already on it: their roles, description, handles or name. Only the parts it is asked to change are changed.',
    'tools.help.roster.update.example1':
        'Sara is promoted and an admin asks the agent to add the role "Team lead" to her.',
    'tools.help.roster.update.example2':
        'Someone changes their Telegram handle and the agent updates it in team.json.',
    'tools.help.roster.delete.summary':
        'Lets the agent remove a person from team.json. It is the only team.json action that deletes information.',
    'tools.help.roster.delete.example1':
        'Someone leaves the company and an admin asks the agent to take them off the team.',
    'tools.help.roster.delete.example2':
        'An admin asks the agent to remove a person who was added twice by mistake.',
    'tools.help.roster.delete.caution':
        'What is removed is gone, so give this only to agents you trust.',
    'tools.help.agents.call.summary':
        'Lets this agent hand a job to another agent in the project that can do something it cannot, and then pass the result back. It is only offered when the person talking is allowed to ask other agents.',
    'tools.help.agents.call.example1':
        'Someone asks the support agent to add them to the team; support asks the team agent, which may edit team.json.',
    'tools.help.agents.call.example2':
        "A sales agent asks a research agent to look up today's exchange rate.",
    'tools.help.web.fetch.summary':
        'Lets the agent search the internet, read public web pages and check the weather, so it can answer with up-to-date information instead of only what it already knows.',
    'tools.help.web.fetch.example1':
        'Someone asks "what\'s the weather in Tehran tomorrow?" and the agent checks the forecast.',
    'tools.help.web.fetch.example2':
        "Before writing a daily summary, the agent searches today's news.",
    'tools.help.web.fetch.caution':
        'Private and internal addresses are always blocked, whoever asks.',
    'tools.help.basics.summary':
        "Lets the agent know today's date and the current time. Without it, the agent may guess the date wrong.",
    'tools.help.basics.example1': 'Someone asks "what day is it?" and gets the right answer.',
    'tools.help.basics.example2': 'The agent can say correctly that a meeting is three hours away.',
} as const;

export default messages;
