# Queue Smart: High-Level System Overview

## 1. Initial Thoughts

### Target Users
* **Administrators/Staff:** Employees managing and monitoring services and client requests at the reception.
* **Clients:** Individuals seeking to use a business’s services who need to join a queue or book an appointment.

### System Interaction
* **Clients:** Interact via the web application to sign up for waitlists, track current status and estimated wait time, and receive email or text notifications regarding status changes or turn proximity.
* **Administrators:** Access the web application to create or modify services (name, description, expected service duration, priority level, capacity limit) and manage queues (leave/join, positions, priority levels).

### Core Features
* **Priority Features:** Real-time notifications and estimated queue timers to help users plan their time effectively.
* **Admin Controls:** Comprehensive service and queue management for staff efficiency.
* **Security:** User authentication and role-based access control to ensure authorized access and protect personal information.

### Anticipated Challenges
* **Dynamic Wait Times:** Accurately estimating wait times requires interpolating variables like expected service duration, queue length, priority levels, and unexpected delays. The system must recalculate and update these times dynamically to maintain accuracy.

## 2. Development Methodology

### Approach: Agile
We are utilizing an **Agile methodology**, managed via **Trello** for task tracking. This involves an iterative approach featuring weekly feedback cycles and incremental development.

### Why Agile?
Agile allows us to establish a Minimum Viable Product (MVP) early in the development cycle. As the project evolves, we can adapt to feedback and integrate additional features as required by the project scope.

### Team Workflow
This iterative structure allows us to break down the broader project into manageable, assignment-sized tasks. It facilitates regular progress checks and provides the flexibility to pivot or adjust workloads seamlessly across multiple assignments.

## 3. Architecture Diagram

![Software Design Project](./Software-Design-Project)
