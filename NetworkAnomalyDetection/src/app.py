from scapy.all import sniff
from scapy.layers.inet import IP, TCP, UDP
import time
from collections import Counter

class PacketSniffer:
    def __init__(self, interface, detector):
        self.interface = interface
        self.packet_count = 0
        self.src_ips = Counter()
        self.dst_ips = Counter()
        self.protocols = Counter()
        self.tcp_count = 0
        self.udp_count = 0
        self.detector = detector
        self.start_time = time.time()
        self.last_print_time = self.start_time

    def process_packet(self, packet):
        self.packet_count += 1
        if IP in packet:
            self.src_ips[packet[IP].src] += 1
            self.dst_ips[packet[IP].dst] += 1
            self.protocols[packet[IP].proto] += 1
            if TCP in packet:
                self.tcp_count += 1
            if UDP in packet:
                self.udp_count += 1

        current_time = time.time()
        elapsed_time = current_time - self.start_time

        if current_time - self.last_print_time >= 2:  # Print every 2 seconds
            self.last_print_time = current_time
            features = {
                "packet_count": self.packet_count,
                "src_ips": len(self.src_ips),
                "dst_ips": len(self.dst_ips),
                "protocols": len(self.protocols),
                "tcp_count": self.tcp_count,
                "udp_count": self.udp_count,
                "elapsed_time": elapsed_time
            }

            print("\nCaptured features:")
            for feature, value in features.items():
                print(f" - {feature}: {value}")

            alerts = self.detector.detect(features)
            if alerts:
                print("\nAnomalies detected:")
                for alert in alerts:
                    print(f"- {alert}")
            else:
                print("No anomalies detected")

    def start_sniffing(self):
        print(f"Started sniffing on {self.interface}")
        sniff(iface=self.interface, prn=self.process_packet, store=0)

class AnomalyDetector:
    def __init__(self, thresholds):
        self.thresholds = thresholds

    def detect(self, features):
        alerts = []
        if features["packet_count"] > self.thresholds["packet_count"]:
            alerts.append("High packet count")
        if features["src_ips"] > self.thresholds["src_ips"]:
            alerts.append("High number of source IPs")
        if features["dst_ips"] > self.thresholds["dst_ips"]:
            alerts.append("High number of destination IPs")
        if features["protocols"] > self.thresholds["protocols"]:
            alerts.append("High number of protocols")
        if features["tcp_count"] > self.thresholds["tcp_count"]:
            alerts.append("High TCP packet count")
        if features["udp_count"] > self.thresholds["udp_count"]:
            alerts.append("High UDP packet count")
        return alerts

def main():
    interface = "Wi-Fi"

    # Define some thresholds for anomaly detection
    thresholds = {
        "packet_count": 1000,
        "src_ips": 10,
        "dst_ips": 10,
        "protocols": 5,
        "tcp_count": 500,
        "udp_count": 500
    }

    detector = AnomalyDetector(thresholds)
    sniffer = PacketSniffer(interface, detector)

    try:
        sniffer.start_sniffing()
    except KeyboardInterrupt:
        print("\nStopping packet capture")

if __name__ == "__main__":
    main() 