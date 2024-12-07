// Initialize Bootstrap toast
const toastEl = document.getElementById('toast');
const toast = new bootstrap.Toast(toastEl);

// Show notification
function showToast(title, message, type = 'success') {
    const toastEl = document.getElementById('toast');
    const toastTitle = toastEl.querySelector('.toast-header strong');
    const toastBody = toastEl.querySelector('.toast-body');
    
    toastTitle.textContent = title;
    toastBody.textContent = typeof message === 'object' ? JSON.stringify(message) : message;
    
    toastEl.classList.remove('bg-success', 'bg-danger', 'bg-warning');
    toastEl.classList.add(type === 'error' ? 'bg-danger' : type === 'warning' ? 'bg-warning' : 'bg-success');
    
    const toast = new bootstrap.Toast(toastEl);
    toast.show();
}

// Format duration
function formatDuration(minutes) {
    if (minutes < 1) {
        const seconds = Math.round(minutes * 60);
        return `${seconds} sec`;
    } else if (minutes < 60) {
        return `${Math.round(minutes)} min`;
    } else {
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = Math.round(minutes % 60);
        return remainingMinutes > 0 ? 
            `${hours}h ${remainingMinutes}m` : 
            `${hours}h`;
    }
}

// Format datetime
function formatDateTime(isoString) {
    if (!isoString) return 'Never';
    const date = new Date(isoString);
    return date.toLocaleString();
}

// Refresh jobs list
async function refreshJobs() {
    fetch('/jobs')
        .then(response => response.json())
        .then(jobs => {
            const jobsList = document.getElementById('jobsList');
            jobsList.innerHTML = '';
            
            jobs.forEach(job => {
                const row = document.createElement('tr');
                const status = job.paused ? 'Paused' : 'Monitoring';
                const statusClass = job.paused ? 'text-warning' : 'text-success';
                
                row.innerHTML = `
                    <td>${job.job_id}</td>
                    <td>
                        ${job.schedule}
                        <div class="small text-muted">${cronstrue.toString(job.schedule)}</div>
                    </td>
                    <td class="text-center">${job.tolerance_minutes}</td>
                    <td class="text-center">${job.max_runtime_minutes}</td>
                    <td>${formatDateTime(job.next_scheduled_run)}</td>
                    <td><span class="${statusClass}">${status}</span></td>
                    <td>
                        <div class="d-flex gap-2">
                            ${!job.paused ? 
                                `<button class="btn btn-sm btn-outline-warning" onclick="pauseJob('${job.job_id}')" title="Pause Monitoring">
                                    <i class="bi bi-pause-fill"></i>
                                </button>` :
                                `<button class="btn btn-sm btn-outline-success" onclick="resumeJob('${job.job_id}')" title="Resume Monitoring">
                                    <i class="bi bi-play-fill"></i>
                                </button>`
                            }
                            <button class="btn btn-sm btn-outline-danger" onclick="deleteJob('${job.job_id}')" title="Delete Job">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </td>
                `;
                jobsList.appendChild(row);
            });
        })
        .catch(error => showToast('Error', 'Failed to refresh jobs: ' + error.message, 'error'));
}

// Refresh simulations list
async function refreshSimulations() {
    try {
        const response = await fetch('/jobs');
        const jobs = await response.json();
        
        const simulationsList = document.getElementById('simulationsList');
        simulationsList.innerHTML = '';
        
        for (const job of jobs) {
            const row = document.createElement('tr');
            const isHealthCheck = !job.max_runtime_minutes;
            
            // Job ID column
            const jobIdCell = document.createElement('td');
            jobIdCell.textContent = job.job_id;
            row.appendChild(jobIdCell);
            
            // Last Start column
            const lastStartCell = document.createElement('td');
            if (isHealthCheck) {
                lastStartCell.textContent = job.last_start_time ? 'Last Check: ' + new Date(job.last_start_time).toLocaleString() : 'Never Checked';
            } else {
                lastStartCell.textContent = job.last_start_time ? new Date(job.last_start_time).toLocaleString() : 'Never';
            }
            row.appendChild(lastStartCell);
            
            // Last End column
            const lastEndCell = document.createElement('td');
            if (isHealthCheck) {
                lastEndCell.innerHTML = '<em>N/A</em>';
            } else {
                lastEndCell.textContent = job.last_end_time ? new Date(job.last_end_time).toLocaleString() : 'Never';
            }
            row.appendChild(lastEndCell);
            
            // Duration column
            const durationCell = document.createElement('td');
            if (isHealthCheck) {
                durationCell.innerHTML = '<em>Instant</em>';
            } else {
                durationCell.textContent = job.duration ? `${job.duration} minutes` : '-';
            }
            row.appendChild(durationCell);
            
            // Status column
            const statusCell = document.createElement('td');
            let status;
            if (job.paused) {
                status = 'Paused';
            } else if (isHealthCheck) {
                status = job.last_start_time ? 'Ready' : 'Waiting for First Check';
            } else {
                status = job.last_start_time && (!job.last_end_time || new Date(job.last_start_time) > new Date(job.last_end_time)) ? 
                    'Running' : 'Not Running';
            }
            statusCell.textContent = status;
            row.appendChild(statusCell);
            
            // Actions column
            const actionsCell = document.createElement('td');
            const startBtn = document.createElement('button');
            startBtn.className = 'btn btn-sm btn-success me-1';
            if (isHealthCheck) {
                startBtn.innerHTML = '<i class="bi bi-check-circle"></i>';
                startBtn.title = 'Simulate Health Check';
            } else {
                startBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
                startBtn.title = 'Start Job';
            }
            startBtn.onclick = () => startJob(job.job_id);
            startBtn.disabled = (status === 'Running' && !isHealthCheck) || job.paused;
            actionsCell.appendChild(startBtn);
            
            // Only show end button for monitored jobs
            if (!isHealthCheck) {
                const endBtn = document.createElement('button');
                endBtn.className = 'btn btn-sm btn-danger me-1';
                endBtn.innerHTML = '<i class="bi bi-stop-fill"></i>';
                endBtn.onclick = () => endJob(job.job_id);
                endBtn.disabled = status !== 'Running' || job.paused;
                actionsCell.appendChild(endBtn);
            }
            
            const pauseBtn = document.createElement('button');
            pauseBtn.className = 'btn btn-sm btn-warning';
            pauseBtn.innerHTML = job.paused ? 
                '<i class="bi bi-play-fill"></i>' : 
                '<i class="bi bi-pause-fill"></i>';
            pauseBtn.onclick = () => job.paused ? resumeJob(job.job_id) : pauseJob(job.job_id);
            actionsCell.appendChild(pauseBtn);
            
            row.appendChild(actionsCell);
            simulationsList.appendChild(row);
        }
    } catch (error) {
        console.error('Error refreshing simulations:', error);
        showToast('Error', 'Failed to refresh simulations', 'error');
    }
}

// Global state for runs pagination
let currentRunsPage = 1;
let totalRunsPages = 1;

async function refreshRuns() {
    try {
        const response = await fetch(`/job_runs?page=${currentRunsPage}`);
        const data = await response.json();
        
        const runsList = document.getElementById('runsList');
        runsList.innerHTML = '';
        
        // Update pagination info
        totalRunsPages = data.total_pages;
        document.getElementById('runsStartRange').textContent = ((data.page - 1) * data.per_page) + 1;
        document.getElementById('runsEndRange').textContent = Math.min(data.page * data.per_page, data.total);
        document.getElementById('totalRuns').textContent = data.total;
        
        // Update table
        for (const run of data.runs) {
            const row = document.createElement('tr');
            
            // Job ID
            const jobIdCell = document.createElement('td');
            jobIdCell.textContent = run.job_id;
            row.appendChild(jobIdCell);
            
            // Start Time
            const startTimeCell = document.createElement('td');
            startTimeCell.textContent = run.start_time ? new Date(run.start_time).toLocaleString() : '-';
            row.appendChild(startTimeCell);
            
            // End Time
            const endTimeCell = document.createElement('td');
            if (run.is_health_check) {
                const badge = document.createElement('span');
                badge.className = 'badge bg-info';
                badge.textContent = 'Health Check';
                endTimeCell.appendChild(badge);
            } else {
                endTimeCell.textContent = run.end_time ? new Date(run.end_time).toLocaleString() : 'Running...';
            }
            row.appendChild(endTimeCell);
            
            // Duration
            const durationCell = document.createElement('td');
            if (run.is_health_check) {
                const badge = document.createElement('span');
                badge.className = 'badge bg-secondary';
                badge.textContent = 'Instant';
                durationCell.appendChild(badge);
            } else if (run.duration) {
                durationCell.textContent = formatDuration(run.duration);
            } else if (run.start_time && !run.end_time) {
                const currentDuration = (new Date() - new Date(run.start_time)) / (1000 * 60);
                durationCell.innerHTML = `<em>${formatDuration(currentDuration)} (Running)</em>`;
            } else {
                durationCell.textContent = '-';
            }
            row.appendChild(durationCell);
            
            // Client Info
            const clientInfoCell = document.createElement('td');
            if (run.client_info) {
                const viewButton = document.createElement('button');
                viewButton.className = 'btn btn-sm btn-outline-info';
                viewButton.innerHTML = '<i class="bi bi-info-circle"></i> View Details';
                viewButton.onclick = () => showClientInfo(
                    typeof run.client_info === 'string' ? 
                    JSON.parse(run.client_info) : run.client_info
                );
                clientInfoCell.appendChild(viewButton);
            } else {
                clientInfoCell.textContent = 'No info';
            }
            row.appendChild(clientInfoCell);
            
            runsList.appendChild(row);
        }
        
        // Update pagination buttons
        const prevButton = document.querySelector('button[onclick="previousRunsPage()"]');
        const nextButton = document.querySelector('button[onclick="nextRunsPage()"]');
        prevButton.disabled = currentRunsPage === 1;
        nextButton.disabled = currentRunsPage === totalRunsPages;
    } catch (error) {
        console.error('Error refreshing runs:', error);
        showToast('Error', 'Failed to refresh runs', 'error');
    }
}

function previousRunsPage() {
    if (currentRunsPage > 1) {
        currentRunsPage--;
        refreshRuns();
    }
}

function nextRunsPage() {
    if (currentRunsPage < totalRunsPages) {
        currentRunsPage++;
        refreshRuns();
    }
}

// Refresh alerts list
async function refreshAlerts() {
    try {
        const showAcknowledged = document.getElementById('showAcknowledged').checked;
        const response = await fetch(`/job_alerts?include_acknowledged=${showAcknowledged}`);
        const alerts = await response.json();
        
        // Group alerts by job_id to count duplicates
        const alertGroups = {};
        alerts.forEach(alert => {
            const key = alert.job_id;
            if (!alertGroups[key]) {
                alertGroups[key] = {
                    latest: alert,
                    count: 1
                };
            } else {
                alertGroups[key].count++;
                if (new Date(alert.detected_time) > new Date(alertGroups[key].latest.detected_time)) {
                    alertGroups[key].latest = alert;
                }
            }
        });
        
        const alertsList = document.getElementById('alertsList');
        alertsList.innerHTML = '';
        
        Object.values(alertGroups).forEach(group => {
            const alert = group.latest;
            const row = document.createElement('tr');
            
            // Job ID column
            const jobIdCell = document.createElement('td');
            jobIdCell.textContent = alert.job_id;
            if (group.count > 1) {
                const countBadge = document.createElement('span');
                countBadge.className = 'badge bg-secondary ms-2';
                countBadge.textContent = `${group.count}x`;
                jobIdCell.appendChild(countBadge);
            }
            row.appendChild(jobIdCell);
            
            // Timestamp column
            const timestampCell = document.createElement('td');
            timestampCell.textContent = new Date(alert.detected_time).toLocaleString();
            row.appendChild(timestampCell);
            
            // Message column with badge
            const messageCell = document.createElement('td');
            const badge = document.createElement('span');
            badge.className = 'badge bg-info text-light cursor-pointer';
            badge.style.cursor = 'pointer';
            badge.textContent = 'View Message';
            badge.onclick = () => showAlertMessage(alert.alert_message);
            messageCell.appendChild(badge);
            row.appendChild(messageCell);
            
            // Status column
            const statusCell = document.createElement('td');
            const statusBadge = document.createElement('span');
            statusBadge.className = `badge ${alert.acknowledged ? 'bg-secondary' : 'bg-warning'}`;
            statusBadge.textContent = alert.acknowledged ? 'Acknowledged' : 'New';
            statusCell.appendChild(statusBadge);
            row.appendChild(statusCell);
            
            // Actions column
            const actionsCell = document.createElement('td');
            if (!alert.acknowledged) {
                const ackButton = document.createElement('button');
                ackButton.className = 'btn btn-sm btn-outline-primary';
                ackButton.textContent = 'Acknowledge';
                ackButton.onclick = () => acknowledgeAlert(alert.id);
                actionsCell.appendChild(ackButton);
            }
            row.appendChild(actionsCell);
            
            alertsList.appendChild(row);
        });
    } catch (error) {
        console.error('Error refreshing alerts:', error);
        showToast('Error', 'Failed to refresh alerts', 'error');
    }
}

async function acknowledgeAlert(alertId) {
    try {
        const response = await fetch(`/acknowledge_alert/${alertId}`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error('Failed to acknowledge alert');
        }
        
        showToast('Success', 'Alert acknowledged', 'success');
        refreshAlerts();
    } catch (error) {
        console.error('Error acknowledging alert:', error);
        showToast('Error', 'Failed to acknowledge alert', 'error');
    }
}

// Helper functions
function getAlertTypeBadgeClass(type) {
    switch (type) {
        case 'missed_job':
            return 'bg-danger';
        case 'long_running':
            return 'bg-warning text-dark';
        default:
            return 'bg-secondary';
    }
}

function formatAlertType(type) {
    return type.split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function showClientInfo(clientInfo) {
    const modalBody = document.getElementById('clientInfoModalBody');
    let content = '<div class="table-responsive"><table class="table table-sm">';

    // Add IP address if available
    content += `
        <tr>
            <th>IP Address</th>
            <td>${clientInfo.ip || 'N/A'}</td>
        </tr>`;

    // Add timestamp if available
    if (clientInfo.timestamp) {
        content += `
            <tr>
                <th>Timestamp</th>
                <td>${new Date(clientInfo.timestamp).toLocaleString()}</td>
            </tr>`;
    }

    // Add headers if available
    if (clientInfo.headers) {
        content += `
            <tr>
                <th>Headers</th>
                <td><pre class="mb-0"><code>${JSON.stringify(clientInfo.headers, null, 2)}</code></pre></td>
            </tr>`;
    }

    // Add any additional info
    Object.entries(clientInfo).forEach(([key, value]) => {
        if (!['ip', 'timestamp', 'headers'].includes(key)) {
            content += `
                <tr>
                    <th>${key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</th>
                    <td>${typeof value === 'object' ? JSON.stringify(value, null, 2) : value}</td>
                </tr>`;
        }
    });

    content += '</table></div>';
    modalBody.innerHTML = content;

    const modal = new bootstrap.Modal(document.getElementById('clientInfoModal'));
    modal.show();
}

// Update schedule help text when schedule input changes
document.getElementById('schedule').addEventListener('input', function(e) {
    const scheduleHelp = document.getElementById('scheduleHelp');
    try {
        const explanation = cronstrue.toString(e.target.value);
        scheduleHelp.textContent = explanation;
        scheduleHelp.style.color = '#6c757d';
    } catch (error) {
        scheduleHelp.textContent = 'Invalid cron expression';
        scheduleHelp.style.color = '#dc3545';
    }
});

// Theme handling
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-bs-theme', savedTheme);
    document.getElementById('themeSwitch').checked = savedTheme === 'dark';
    
    // Update navbar class based on theme
    const navbar = document.querySelector('.navbar');
    if (savedTheme === 'dark') {
        navbar.classList.remove('navbar-light', 'bg-light');
        navbar.classList.add('navbar-dark', 'bg-dark');
    } else {
        navbar.classList.remove('navbar-dark', 'bg-dark');
        navbar.classList.add('navbar-light', 'bg-light');
    }
}

function toggleTheme(e) {
    const isDark = e.target.checked;
    const theme = isDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-bs-theme', theme);
    localStorage.setItem('theme', theme);
    
    // Update navbar class
    const navbar = document.querySelector('.navbar');
    if (isDark) {
        navbar.classList.remove('navbar-light', 'bg-light');
        navbar.classList.add('navbar-dark', 'bg-dark');
    } else {
        navbar.classList.remove('navbar-dark', 'bg-dark');
        navbar.classList.add('navbar-light', 'bg-light');
    }
}

// Initialize theme
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    document.getElementById('themeSwitch').addEventListener('change', toggleTheme);
    
    // Initial load
    refreshJobs();
    refreshSimulations();
    refreshRuns();
    refreshAlerts();
    
    // Add event listener to new job form
    document.getElementById('newJobForm').addEventListener('submit', addJob);
    
    // Set up periodic refresh
    setInterval(refreshJobs, 30000);
    setInterval(refreshSimulations, 15000);
    setInterval(refreshRuns, 15000);
    setInterval(refreshAlerts, 10000);
});

function showAlertMessage(message) {
    const messageContent = document.getElementById('alertMessageContent');
    messageContent.textContent = message;
    const modal = new bootstrap.Modal(document.getElementById('alertMessageModal'));
    modal.show();
}

// Delete job
async function deleteJob(jobId) {
    if (!confirm(`Are you sure you want to delete job ${jobId}?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/jobs/${jobId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showToast('Success', `Job ${jobId} deleted successfully`);
            // Refresh all tables since delete affects everything
            await Promise.all([
                refreshJobs(),
                refreshSimulations(),
                refreshRuns(),
                refreshAlerts()
            ]);
        } else {
            const data = await response.json();
            showToast('Error', data.detail || 'Failed to delete job', 'error');
        }
    } catch (error) {
        showToast('Error', 'Failed to delete job', 'error');
        console.error('Error deleting job:', error);
    }
}

// Show client details in a modal
function showClientDetails(clientInfo) {
    if (!clientInfo) {
        showToast('Info', 'No client information available', 'info');
        return;
    }

    // Extract additional info from client metadata
    const additionalInfo = clientInfo.additional_info || {};
    
    const modalHtml = `
        <div class="list-group list-group-flush">
            <div class="list-group-item">
                <small class="text-muted">IP Address</small>
                <div>${clientInfo.ip_address || 'N/A'}</div>
            </div>
            <div class="list-group-item">
                <small class="text-muted">Hostname</small>
                <div>${clientInfo.hostname || 'N/A'}</div>
            </div>
            <div class="list-group-item">
                <small class="text-muted">OS Info</small>
                <div>${clientInfo.os_info || 'N/A'}</div>
            </div>
            <div class="list-group-item">
                <small class="text-muted">User Agent</small>
                <div>${clientInfo.user_agent || 'N/A'}</div>
            </div>
            ${Object.entries(additionalInfo)
                .map(([key, value]) => `
                    <div class="list-group-item">
                        <small class="text-muted">${key}</small>
                        <div>${typeof value === 'object' ? JSON.stringify(value, null, 2) : value}</div>
                    </div>
                `).join('')}
        </div>
    `;
    
    document.getElementById('clientDetailsModalBody').innerHTML = modalHtml;
    
    const modal = new bootstrap.Modal(document.getElementById('clientDetailsModal'));
    modal.show();
}

// Add or update job configuration
async function addJob(event) {
    event.preventDefault();
    const jobId = document.getElementById('jobId').value;
    const schedule = document.getElementById('schedule').value;
    const tolerance = parseInt(document.getElementById('tolerance').value);
    const maxRuntimeInput = document.getElementById('maxRuntime');
    const maxRuntime = maxRuntimeInput.value.trim() === '' ? null : parseInt(maxRuntimeInput.value);

    try {
        // First check if job already exists
        const response = await fetch('/jobs');
        const jobs = await response.json();
        const existingJob = jobs.find(job => job.job_id === jobId);
        
        if (existingJob) {
            const confirmOverwrite = confirm(`A job with ID "${jobId}" already exists. Do you want to update it?`);
            if (!confirmOverwrite) {
                return;
            }
        }

        const createResponse = await fetch('/jobs', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                job_id: jobId,
                schedule: schedule,
                tolerance_minutes: tolerance,
                max_runtime_minutes: maxRuntime
            }),
        });

        if (!createResponse.ok) {
            const error = await createResponse.json();
            showToast('Error', error.detail || 'Failed to configure job', 'error');
            return;
        }

        showToast('Success', `Job ${existingJob ? 'updated' : 'created'} successfully`);
        document.getElementById('newJobForm').reset();
        // Refresh all relevant tables
        await Promise.all([
            refreshJobs(),
            refreshSimulations()
        ]);
    } catch (error) {
        showToast('Error', 'Failed to configure job: ' + error.message, 'error');
    }
}

// Start job
async function startJob(jobId) {
    try {
        const response = await fetch(`/jobs/${jobId}/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();
        
        if (response.ok) {
            showToast('Success', 'Job started successfully');
            if (data.alert) {
                showToast('Warning', data.alert);
            }
            // Refresh all relevant tables
            await Promise.all([
                refreshSimulations(),
                refreshRuns(),
                refreshAlerts()
            ]);
        } else {
            showToast('Error', data.detail || 'Failed to start job', 'error');
        }
    } catch (error) {
        showToast('Error', 'Failed to start job', 'error');
        console.error('Error starting job:', error);
    }
}

// Pause job
async function pauseJob(jobId) {
    try {
        const response = await fetch(`/jobs/${jobId}/pause`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            showToast('Success', 'Job paused successfully');
            // Refresh both job tables since pause affects both views
            await Promise.all([
                refreshJobs(),
                refreshSimulations()
            ]);
        } else {
            const error = await response.json();
            showToast('Error', error.detail || 'Failed to pause job', 'error');
        }
    } catch (error) {
        showToast('Error', 'Failed to pause job', 'error');
        console.error('Error pausing job:', error);
    }
}

// Resume job
async function resumeJob(jobId) {
    try {
        const response = await fetch(`/jobs/${jobId}/resume`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            showToast('Success', 'Job resumed successfully');
            // Refresh both job tables since resume affects both views
            await Promise.all([
                refreshJobs(),
                refreshSimulations()
            ]);
        } else {
            const error = await response.json();
            showToast('Error', error.detail || 'Failed to resume job', 'error');
        }
    } catch (error) {
        showToast('Error', 'Failed to resume job', 'error');
        console.error('Error resuming job:', error);
    }
}

// End job
async function endJob(jobId) {
    try {
        const response = await fetch(`/jobs/${jobId}/end`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            showToast('Success', 'Job ended successfully');
            // Refresh all relevant tables
            await Promise.all([
                refreshSimulations(),
                refreshRuns(),
                refreshAlerts()
            ]);
        } else {
            const error = await response.json();
            showToast('Error', error.detail || 'Failed to end job', 'error');
        }
    } catch (error) {
        showToast('Error', 'Failed to end job', 'error');
        console.error('Error ending job:', error);
    }
}
