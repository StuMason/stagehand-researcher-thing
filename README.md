# Stagehand Research Tool

This project is built with [Stagehand](https://github.com/browserbase/stagehand) and is designed to automate research tasks using browser interactions.

## Overview

The Stagehand Research Tool allows you to perform automated research by leveraging AI and browser automation. It can search for profiles, extract relevant information, and navigate through various web pages seamlessly.

## Features

- **Automated Browser Interactions**: Utilize Playwright's capabilities to automate browser tasks.
- **AI-Powered Research**: Integrate with AI models to enhance data extraction and decision-making.
- **Dynamic Query Handling**: Automatically generate additional queries based on initial findings to improve research depth.
- **Error Handling and Logging**: Robust error handling and logging mechanisms to track the research process.
- **Redis Queues with Bull**: Efficiently manage and process research jobs using Redis and Bull.


## Getting Started

### Prerequisites

- Node.js (version 14 or higher)
- NPM (Node Package Manager)
- Redis (for queue management)

### Installation

1. Clone the repository:

```bash
git clone https://github.com/browserbase/stagehand-research-tool.git
cd stagehand-research-tool
```

2. Install the dependencies:

```bash
npm install
```

3. Set up your environment variables by copying the example file:

```bash
cp .env.example .env
```

Add your API keys to the `.env` file.

### Running the Tool

To start the research tool, run:

```bash
npm start
```

This will initialize the Stagehand instance and begin the research process as defined in the `main()` function.

### API Endpoints

The server exposes several endpoints for conducting research:

- **Research a Profile**: 
  - **Endpoint**: `POST /research`
  - **Request Body**:
    ```json
    {
      "name": "Profile Name",
      "context": "Profile Context"
    }
    ```
### Example Usage

You can use the tool to research profiles by sending a POST request to the `/research` endpoint with the required data. For example:

```bash
curl -X POST http://localhost:3333/research \
-H "Content-Type: application/json" \
-d '{
"name": "Iggy Hammick",
"context": "Designer, founder of dark blue"
}'
```

### Monitoring the Research Process

You can monitor the research process by viewing the logs in the terminal. The tool logs information about the research process, including the queries being executed, the data being extracted, and any errors encountered.

## Queue Management

The research tool uses Redis and Bull for queue management. You can monitor the queue and view the status of the jobs by accessing the Bull dashboard.

To access the Bull dashboard, goto `http://localhost:3333/monitor` in your browser.
### Customization

You can customize the behavior of the research tool by modifying the configuration in `stagehand.config.ts` and adjusting the logic in `src/services/researchService.js`.

### Contributing

We welcome contributions! If you have suggestions or improvements, please create an issue or submit a pull request.

### License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## 🤘 Thanks for using the Stagehand Research Tool!

Create an issue if you have any feedback: [GitHub Issues](https://github.com/browserbase/stagehand/issues/new)
