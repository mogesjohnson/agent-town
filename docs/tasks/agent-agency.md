# Agent agency

Residents choose bounded in-game goals from needs and personality instead of only random wandering.
- Goals: visit an open place, seek a resident, rest in the park, explore.
- Show current intentions and explain that choices use zero extra model calls.
- Respect pause, unavailable/busy agents, existing jobs, minigames and turn limits.
- Keep model output as speech; no tool, filesystem or command access is added.
- Validate destination bounds and test need priorities and pause behavior.
