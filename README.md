# Sage
Feature rich  VS code extension for interacting with and configuring local, open source large language models.

## Features (TBD, in progress)

- Mutli-platform support (CUDA, MPS currently), thanks to PyTorch and Hugging Face.
    - LangChain is used for chaining and tool calling.
- Customizable models, configurations, embeddings, etc.
- Code editing capabilities, including:
    - File creation
    - Function creation
    - Class creation
    - Test creation
    - Documentation creation
- The backend can be hosted on a seperate machine, allowing the user to deploy Sage to a non-GPU poor system and access it anywhere.
- Generic style chat interface, allowing the model to generate code and the ability to edit the code directly.
- Code analysis tool that intelligently parses and embeds the code for general purpose questions about the codebase.
    - Intelligent code parsing, with Tree Sitter, to allow for repo-wide context and analysis by the LLM without worrying about context length issues.
- Chat history, allowing the user to continue a conversation from the same place.
    - Chat history is cross-model, allowing the user to switch between models while continuing the same conversation.