# Network Anomaly Detection System

A real-time network traffic monitoring and anomaly detection system built with Python, Scapy, and NPCap.

## Features
- Real-time packet capture and analysis
- Monitoring of packet counts, IP addresses, and protocols
- Threshold-based anomaly detection
- Support for TCP and UDP traffic analysis

## Requirements
- Python 3.x
- Scapy
- NPCap

## Installation
1. Install NPCap from [NPCap's official website](https://npcap.com/)
2. Install required Python packages:
```bash
pip install scapy
```

## Usage
Run the application:
```bash
python src/app.py
```

The system will start monitoring network traffic on your Wi-Fi interface and display:
- Packet counts
- Source and destination IP statistics
- Protocol distribution
- Anomaly alerts based on configured thresholds

## Configuration
Thresholds for anomaly detection can be configured in the `app.py` file:
```python
thresholds = {
    "packet_count": 1000,
    "src_ips": 10,
    "dst_ips": 10,
    "protocols": 5,
    "tcp_count": 500,
    "udp_count": 500
}
```

## Project Structure
```
NetworkAnomalyDetection/
├── src/
│   └── app.py         # Main application file
├── README.md          # Project documentation
└── requirements.txt   # Python dependencies
``` 