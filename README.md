# YouTube Trending Analytics Copilot

### Live Demo: [Website Url](https://youtube-trending-analytics.netlify.app/)

![Status Badge](https://img.shields.io/badge/status-active-success) ![License Badge](https://img.shields.io/badge/license-MIT-blue) ![Python Version](https://img.shields.io/badge/python-3.9%2B-blue)

A full-stack analytics dashboard that provides real-time insights into trending YouTube videos across different regions. This application combines a **FastAPI** backend for data retrieval with a responsive **JavaScript** frontend for visualization and natural language interaction.


---

## 📖 Table of Contents
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [Installation & Setup](#-installation--setup)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
- [API Reference](#-api-reference)
- [Deployment](#-deployment)

---

## 🚀 Features

* **Real-Time Trending Data:** Fetches the top 50 trending videos for multiple regions (US, India, UK, Germany, etc.) via the YouTube Data API.
* **Interactive Dashboard:** Visualizes data using Plotly.js charts (Top Videos by Views, Category Distribution).
* **AI-Like Chat Interface:** A rule-based chatbot that accepts natural language commands (e.g., *"Show top 20 trending videos in India"*) to control the dashboard and answers questions about the data (e.g., *"Which channel has the most views?"*).
* **Detailed Metrics:** Calculates average views, median views, engagement ratios (likes/comments), and identifies top-performing channels.
* **Snapshot Management:** Save specific dashboard states to LocalStorage for later comparison without re-fetching data.
* **Data Export:** Export current dashboard data to CSV.

---

## 🛠 Tech Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Backend** | Python, FastAPI | High-performance API framework. |
| **Server** | Uvicorn | ASGI server for running the application. |
| **Data Processing** | Pandas | Data manipulation and metric calculation. |
| **External API** | YouTube Data API v3 | Source of trending video data. |
| **Frontend** | HTML5, CSS3 | Structure and styling. |
| **Scripting** | Vanilla JavaScript (ES6+) | DOM manipulation and application logic. |
| **Visualization** | Plotly.js | Interactive bar charts and graphs. |

---

## 📂 Project Structure

```text
YouTube-Trending-Analytics-Copilot/
├── backend/
│   ├── app/
│   │   └── main.py          # FastAPI application & logic
│   ├── requirements.txt     # Python dependencies
│   └── .env                 # Environment variables (API Key)
├── frontend/
│   ├── index.html           # Main dashboard UI
│   ├── style.css            # Application styling
│   └── app.js               # Frontend logic & event handling
└── README.md
```
---

## 📋 Prerequisites

Before running the project, ensure you have the following:

1.  **Python 3.9+** installed.
2.  A **Google Cloud Project** with the **YouTube Data API v3** enabled.
3.  An **API Key** from the Google Cloud Console.

---

## ⚙ Installation & Setup

### Backend Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/YouTube-Trending-Analytics-Copilot.git
    cd YouTube-Trending-Analytics-Copilot/backend
    ```

2.  **Create a virtual environment:**
    ```bash
    python -m venv venv
    # On Windows
    venv\Scripts\activate
    # On macOS/Linux
    source venv/bin/activate
    ```

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Configure Environment:**
    Create a `.env` file in the `backend` directory and add your YouTube API Key:
    ```env
    YOUTUBE_API_KEY=your_actual_api_key_here
    ```

5.  **Run the Server:**
    ```bash
    uvicorn app.main:app --reload --port 8000
    ```
    The API will be available at `http://localhost:8000`.

### Frontend Setup

1.  **Navigate to the frontend folder:**
    ```bash
    cd ../frontend
    ```

2.  **Configure API URL:**
    Open `app.js` and ensure the `API_BASE` matches your backend URL. If you've deployed your backend, use that URL. For local testing:
    ```javascript
    // In app.js
    const API_BASE = "http://localhost:8000"; 
    ```

3.  **Run the Frontend:**
    You can open `index.html` directly in your browser, or use a simple HTTP server like Live Server (VS Code extension) or Python:
    ```bash
    python -m http.server 5500
    ```
    Access the dashboard at `http://localhost:5500`.

---

## 🔌 API Reference

### `GET /api/trending`
Fetches trending videos for a specific region.

* **Parameters:**
    * `region` (str): Country code (e.g., "US", "IN"). Default: "US".
    * `limit` (int): Number of videos (1-50). Default: 25.

* **Response Example:**
    ```json
    {
      "region": "US",
      "videos": [ ... ],
      "metrics": {
        "total_videos": 25,
        "total_views": 15000000,
        "avg_views": 600000.0
      }
    }
    ```

### `POST /api/chat`
Processes natural language commands to control the dashboard.

* **Body:**
    ```json
    {
      "message": "Show top 10 trending videos in Germany",
      "default_region": "US",
      "default_limit": 25
    }
    ```

* **Response:** Returns the parsed region, limit, and a confirmation message.

---

## 📸 Screenshots

**Opening Interface:**

![Image](https://github.com/Subani7181/YouTube-Trending-Analytics-Copilot/blob/main/example.jpeg)

**Example:**

![Image](https://github.com/Subani7181/YouTube-Trending-Analytics-Copilot/blob/main/demo.jpeg)

---

## ☁ Deployment

### Backend (Railway/Render/Heroku)
This project includes a `requirements.txt` and is ready for deployment on platforms like Railway or Render. 
1.  Upload the repository to GitHub.
2.  Connect your repository to the hosting service.
3.  Set the `YOUTUBE_API_KEY` in the service's environment variables.
4.  Update the start command if necessary (e.g., `uvicorn app.main:app --host 0.0.0.0 --port $PORT`).

### Frontend (Netlify/Vercel)
The live demo is already hosted on Netlify.
1.  Deploy the `frontend` folder to Netlify or Vercel.
2.  Update `API_BASE` in `app.js` to point to your deployed backend URL (e.g., `https://your-backend-app.up.railway.app`).

---

For queries or collaborations:

- **Email**: [syedmahaboobjani772@gmail.com](mailto:syedmahaboobjani772@gmail.com)
- **LinkedIn**: [Connect with me professionally](https://www.linkedin.com/in/syed-mahabub-jani/)

Thank you!
