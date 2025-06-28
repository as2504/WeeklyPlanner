import React, { useState, useEffect, useCallback } from 'react';

// --- Utility Functions ---
const getWeekNumber = (d) => {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return weekNo;
};

const getWeekId = (date) => {
  const year = date.getFullYear();
  const weekNum = getWeekNumber(date);
  return `${year}-${String(weekNum).padStart(2, '0')}`;
};

const getDayName = (date) => {
  return date.toLocaleString('en-US', { weekday: 'long' });
};

const getMonthDay = (date) => {
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric' });
};

// Function to get the start date (Monday) of a given ISO weekId (YYYY-WW)
const getStartOfWeek = (year, weekNum) => {
    const jan4 = new Date(year, 0, 4); // Jan 4th is always in ISO week 1
    const dayOfWeekJan4 = (jan4.getDay() === 0) ? 7 : jan4.getDay(); // Adjust Sunday from 0 to 7
    const mondayOfJan4Week = new Date(jan4);
    mondayOfJan4Week.setDate(jan4.getDate() + 1 - dayOfWeekJan4); // Go back to Monday

    const targetMonday = new Date(mondayOfJan4Week);
    targetMonday.setDate(mondayOfJan4Week.getDate() + (weekNum - 1) * 7);
    return targetMonday;
};

const getDayDate = (weekId, dayName) => {
  const [year, weekNum] = weekId.split('-').map(Number);
  const startOfWeek = getStartOfWeek(year, weekNum);
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayIndex = daysOfWeek.indexOf(dayName);
  const targetDate = new Date(startOfWeek);
  targetDate.setDate(startOfWeek.getDate() + dayIndex);
  return targetDate;
};

const getWeekInfo = (weekId) => {
  const [year, weekNum] = weekId.split('-').map(Number);
  return {
    year,
    weekNum,
    display: `Week ${weekNum}`
  };
};

const getRelativeWeekId = (currentWeekId, offset) => {
  const [year, weekNum] = currentWeekId.split('-').map(Number);
  let newWeekNum = weekNum + offset;
  let newYear = year;

  // Simple adjustment for year transition, could be more robust for edge cases (53-week years)
  if (newWeekNum > 52) {
    newWeekNum = 1;
    newYear++;
  } else if (newWeekNum < 1) {
    newWeekNum = 52; // Fallback to 52 for simplicity, real impl might need 53
    newYear--;
  }

  return `${newYear}-${String(newWeekNum).padStart(2, '0')}`;
};

const generateUniqueId = () => `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// --- Constants ---
const CATEGORIES = {
  gym: { emoji: '💪', color: '#4ade80', name: 'Gym' }, // Green
  meal: { emoji: '🍽️', color: '#fb923c', name: 'Meal' }, // Orange
  study: { emoji: '📚', color: '#3b82f6', name: 'Study' }, // Blue
  hobby: { emoji: '🎨', color: '#a855f7', name: 'Hobby' }, // Purple
  others: { emoji: '⚡', color: '#6b7280', name: 'Others' }, // Gray
};

const DEFAULT_WEEKLY_TEMPLATE = {
  Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], Sunday: []
};

// --- PWA Service Worker Registration ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(registration => {
        console.log('SW registered: ', registration);
      })
      .catch(registrationError => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}

// --- App Component ---
function App() {
  const today = new Date();
  const initialActiveWeekId = getWeekId(today);
  const initialActiveDayName = getDayName(today);

  // State for the entire app data
  const [appData, setAppData] = useState(() => {
    try {
      const savedData = localStorage.getItem('weeklyPlannerData');
      if (savedData) {
        const parsedData = JSON.parse(savedData);
        // Validate parsedData structure to prevent errors from corrupted data
        if (parsedData && parsedData.weeks && typeof parsedData.currentWeekId === 'string' &&
            typeof parsedData.activeWeekId === 'string' && typeof parsedData.currentDayName === 'string' &&
            typeof parsedData.streak === 'number') {

          // Ensure initialActiveWeekId matches if not present or outdated
          if (!parsedData.weeks[initialActiveWeekId]) {
            const lastActiveWeekId = parsedData.activeWeekId || Object.keys(parsedData.weeks).pop();
            const newWeekTemplate = parsedData.weeks[lastActiveWeekId]?.template || DEFAULT_WEEKLY_TEMPLATE;
            parsedData.weeks[initialActiveWeekId] = {
              template: JSON.parse(JSON.stringify(newWeekTemplate)), // Deep copy
              completions: JSON.parse(JSON.stringify(DEFAULT_WEEKLY_TEMPLATE)), // Deep copy to reset completions
            };
          }

          // Ensure completions arrays exist for all days in existing weeks
          Object.keys(parsedData.weeks).forEach(weekId => {
            if (!parsedData.weeks[weekId].completions) {
              parsedData.weeks[weekId].completions = {};
            }
            Object.keys(DEFAULT_WEEKLY_TEMPLATE).forEach(day => {
              if (!parsedData.weeks[weekId].completions[day] || !Array.isArray(parsedData.weeks[weekId].completions[day])) {
                parsedData.weeks[weekId].completions[day] = [];
              }
            });
          });

          // Reset lastCompletionDate if it's a new day and no tasks were completed yesterday
          if (typeof parsedData.lastCompletionDate === 'string' && parsedData.lastCompletionDate !== today.toISOString().split('T')[0]) {
            const lastDate = new Date(parsedData.lastCompletionDate);
            const daysDiff = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));

            if (daysDiff > 1) {
                parsedData.streak = 0;
            }
          } else if (parsedData.lastCompletionDate === null) {
              // No action needed for null lastCompletionDate
          } else {
            // If it's not null and not a string (corrupted), reset it to null
            parsedData.lastCompletionDate = null;
          }

          parsedData.activeWeekId = initialActiveWeekId; // Always set to current active week
          return parsedData;
        }
      }
    } catch (e) {
      console.error("Failed to load state from localStorage or corrupted data:", e);
      // Fall through to default initial state if error occurs during parsing/validation
    }
    // Default initial state if no saved data, or saved data was corrupted/invalid
    return {
      weeks: {
        [initialActiveWeekId]: {
          template: JSON.parse(JSON.stringify(DEFAULT_WEEKLY_TEMPLATE)), // Deep copy
          completions: JSON.parse(JSON.stringify(DEFAULT_WEEKLY_TEMPLATE)), // Deep copy
        },
      },
      currentWeekId: initialActiveWeekId, // The week currently being viewed
      activeWeekId: initialActiveWeekId, // The actual current week based on the date
      currentDayName: initialActiveDayName,
      streak: 0,
      lastCompletionDate: null, // "YYYY-MM-DD"
    };
  });

  // State for modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState(null); // 'add-task', 'message', 'expand-task'
  const [modalMessage, setModalMessage] = useState('');
  const [modalPayload, setModalPayload] = useState(null); // { dayName: 'Monday', task: {...} } for edit, expand etc.

  // --- Local Storage Effect ---
  useEffect(() => {
    localStorage.setItem('weeklyPlannerData', JSON.stringify(appData));
  }, [appData]);

  // --- Week Initialization/Update Effect ---
  useEffect(() => {
    const todayId = getWeekId(new Date());
    const todayName = getDayName(new Date());

    setAppData(prevAppData => {
      let updatedAppData = { ...prevAppData };
      // Always ensure activeWeekId and currentDayName are up-to-date with actual date
      updatedAppData.activeWeekId = todayId;
      // Only set currentDayName if viewing the active week
      if (updatedAppData.currentWeekId === todayId) {
        updatedAppData.currentDayName = todayName;
      }

      // Initialize new week if necessary
      if (!updatedAppData.weeks[todayId]) {
        console.log(`Initializing new week: ${todayId}`);
        const lastKnownWeekId = prevAppData.activeWeekId || Object.keys(prevAppData.weeks).pop();
        const prevWeekTemplate = prevAppData.weeks[lastKnownWeekId]?.template || DEFAULT_WEEKLY_TEMPLATE;

        updatedAppData.weeks = {
          ...updatedAppData.weeks,
          [todayId]: {
            template: JSON.parse(JSON.stringify(prevWeekTemplate)), // Deep copy
            completions: JSON.parse(JSON.stringify(DEFAULT_WEEKLY_TEMPLATE)), // Deep copy to reset completions
          },
        };
      } else {
        // Ensure completions for the current week's days are arrays on update
        Object.keys(DEFAULT_WEEKLY_TEMPLATE).forEach(day => {
          if (!updatedAppData.weeks[todayId].completions[day] || !Array.isArray(updatedAppData.weeks[todayId].completions[day])) {
            updatedAppData.weeks[todayId].completions[day] = [];
          }
        });
      }


      // Streak update logic (daily check)
      const currentIsoDate = new Date().toISOString().split('T')[0];
      if (updatedAppData.lastCompletionDate && updatedAppData.lastCompletionDate !== currentIsoDate) {
        const lastDate = new Date(updatedAppData.lastCompletionDate);
        const daysDiff = Math.floor((new Date() - lastDate) / (1000 * 60 * 60 * 24));

        if (daysDiff > 1) {
            updatedAppData.streak = 0;
        }
      }

      return updatedAppData;
    });
  }, []); // Run once on mount

  const currentWeekData = appData.weeks[appData.currentWeekId];
  const isHistoricalView = appData.currentWeekId !== appData.activeWeekId;

  // --- Task Operations ---
  const handleAddTask = useCallback((dayName, taskText, categoryType) => {
    setAppData(prevAppData => {
      const newAppData = JSON.parse(JSON.stringify(prevAppData));
      const currentWeek = newAppData.weeks[newAppData.activeWeekId]; // Always modify active week's template

      if (!currentWeek) {
        console.error("Current active week data not found during add task.");
        return prevAppData;
      }

      // Ensure the template array for the specific day exists
      if (!currentWeek.template[dayName]) {
        currentWeek.template[dayName] = [];
      }

      const newTask = {
        id: generateUniqueId(),
        text: taskText,
        category: categoryType,
        emoji: CATEGORIES[categoryType]?.emoji,
      };

      currentWeek.template[dayName].push(newTask);
      // No need to add to completions, as completions tracks only IDs of *completed* tasks.
      // The template is the source of truth for all tasks.

      return newAppData;
    });
    setIsModalOpen(false);
  }, []);

  const handleToggleTaskCompletion = useCallback((dayName, taskId) => {
    setAppData(prevAppData => {
      const newAppData = JSON.parse(JSON.stringify(prevAppData));
      const weekToUpdate = newAppData.weeks[newAppData.currentWeekId];

      if (!weekToUpdate) {
        console.error(`Week data for ${newAppData.currentWeekId} not found during toggle completion.`);
        return prevAppData;
      }

      // Ensure the completions array for the specific day exists and is an array
      if (!weekToUpdate.completions[dayName] || !Array.isArray(weekToUpdate.completions[dayName])) {
        weekToUpdate.completions[dayName] = [];
      }
      const completedTasksForDay = weekToUpdate.completions[dayName];
      const taskIndex = completedTasksForDay.indexOf(taskId);

      if (taskIndex > -1) {
        completedTasksForDay.splice(taskIndex, 1); // Mark as uncompleted
      } else {
        completedTasksForDay.push(taskId); // Mark as completed
      }

      // Streak logic: only update if viewing the active week
      if (newAppData.currentWeekId === newAppData.activeWeekId) {
        // Ensure todayCompletions is an array before checking length
        if (!newAppData.weeks[newAppData.activeWeekId].completions[appData.currentDayName] || !Array.isArray(newAppData.weeks[newAppData.activeWeekId].completions[appData.currentDayName])) {
          newAppData.weeks[newAppData.activeWeekId].completions[appData.currentDayName] = [];
        }
        const todayCompletions = newAppData.weeks[newAppData.activeWeekId].completions[appData.currentDayName];
        if (todayCompletions.length > 0) {
          const currentIsoDate = new Date().toISOString().split('T')[0];
          if (newAppData.lastCompletionDate !== currentIsoDate) {
            newAppData.streak += 1;
            newAppData.lastCompletionDate = currentIsoDate;
          }
        }
      }

      return newAppData;
    });
  }, [appData.currentDayName]);

  const handleEditTaskText = useCallback((dayName, taskId, newText) => {
    setAppData(prevAppData => {
      const newAppData = JSON.parse(JSON.stringify(prevAppData));
      const activeWeek = newAppData.weeks[newAppData.activeWeekId]; // Always modify active week's template

      if (!activeWeek) {
        console.error("Active week data not found during edit task.");
        return prevAppData;
      }

      // Ensure template array for the specific day exists
      if (!activeWeek.template[dayName]) {
        activeWeek.template[dayName] = [];
      }

      const task = activeWeek.template[dayName].find(t => t.id === taskId);
      if (task) {
        task.text = newText;
      }
      return newAppData;
    });
  }, []);

  const handleDeleteTask = useCallback((dayName, taskId) => {
    setAppData(prevAppData => {
      const newAppData = JSON.parse(JSON.stringify(prevAppData));
      const activeWeek = newAppData.weeks[newAppData.activeWeekId]; // Always modify active week's template

      if (!activeWeek) {
        console.error("Active week data not found during delete task.");
        return prevAppData;
      }

      // Ensure template array for the specific day exists
      if (!activeWeek.template[dayName]) {
        activeWeek.template[dayName] = [];
      }

      activeWeek.template[dayName] = activeWeek.template[dayName].filter(t => t.id !== taskId);
      // Also remove from completions for the current active week if present
      if (activeWeek.completions[dayName] && Array.isArray(activeWeek.completions[dayName])) {
        newAppData.weeks[newAppData.activeWeekId].completions[dayName] = activeWeek.completions[dayName].filter(id => id !== taskId);
      }
      return newAppData;
    });
  }, []);

  const handleReorderTasks = useCallback((dayName, newTasks) => {
    setAppData(prevAppData => {
      const newAppData = JSON.parse(JSON.stringify(prevAppData));
      const activeWeek = newAppData.weeks[newAppData.activeWeekId]; // Always modify active week's template

      if (!activeWeek) {
        console.error("Active week data not found during reorder tasks.");
        return prevAppData;
      }

      // Ensure template array for the specific day exists
      if (!activeWeek.template[dayName]) {
        activeWeek.template[dayName] = [];
      }

      activeWeek.template[dayName] = newTasks;
      return newAppData;
    });
  }, []);


  // --- Navigation Handlers ---
  const navigateWeeks = useCallback((offset) => {
    setAppData(prevAppData => {
      const newWeekId = getRelativeWeekId(prevAppData.currentWeekId, offset);
      // If navigating to a new week that doesn't exist, initialize its template from the *active* week's template
      if (!prevAppData.weeks[newWeekId]) {
        const currentActiveWeekTemplate = prevAppData.weeks[prevAppData.activeWeekId]?.template || DEFAULT_WEEKLY_TEMPLATE;
        return {
          ...prevAppData,
          currentWeekId: newWeekId,
          weeks: {
            ...prevAppData.weeks,
            [newWeekId]: {
              template: JSON.parse(JSON.stringify(currentActiveWeekTemplate)), // Deep copy
              completions: JSON.parse(JSON.stringify(DEFAULT_WEEKLY_TEMPLATE)), // Empty completions
            },
          },
        };
      }
      return { ...prevAppData, currentWeekId: newWeekId };
    });
  }, []);

  const navigateDays = useCallback((offset) => {
    setAppData(prevAppData => {
      const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      let currentIndex = daysOfWeek.indexOf(prevAppData.currentDayName);
      let newIndex = (currentIndex + offset + daysOfWeek.length) % daysOfWeek.length;
      return { ...prevAppData, currentDayName: daysOfWeek[newIndex] };
    });
  }, []);

  // --- Progress Tracking Calculations ---
  const calculateCompletionPercentage = useCallback((weekId) => {
    const week = appData.weeks[weekId];
    if (!week) return 0;

    let totalTasks = 0;
    let completedTasks = 0;

    Object.keys(week.template).forEach(day => {
      totalTasks += week.template[day]?.length || 0; // Use optional chaining and default to 0
      completedTasks += week.completions[day]?.length || 0; // Use optional chaining and default to 0
    });

    return totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  }, [appData.weeks]);

  const currentWeekInfo = getWeekInfo(appData.currentWeekId);
  const currentWeekCompletionPercentage = calculateCompletionPercentage(appData.currentWeekId);

  // --- Modals ---
  const openAddTaskModal = (dayName) => {
    if (isHistoricalView) {
      setModalMessage("Cannot add tasks to historical weeks.");
      setModalType('message');
      setIsModalOpen(true);
      return;
    }
    setModalPayload({ dayName });
    setModalType('add-task');
    setIsModalOpen(true);
  };

  const openExpandTaskModal = (task) => {
    if (isHistoricalView) {
      setModalMessage("Cannot expand tasks in historical weeks.");
      setModalType('message');
      setIsModalOpen(true);
      return;
    }
    setModalPayload({ task });
    setModalType('expand-task');
    setIsModalOpen(true);
  };

  const closeModals = () => {
    setIsModalOpen(false);
    setModalType(null);
    setModalMessage('');
    setModalPayload(null);
  };


  return (
    <div className="min-h-screen bg-[#1E1E2F] font-inter text-[#E0E0E0] flex flex-col items-center p-4 sm:p-6 md:p-8">
      {/* Header */}
      <header
        className="w-full max-w-xl rounded-xl shadow-lg mb-4 text-center transition-all duration-300 ease-in-out"
        style={{
          backgroundColor: 'rgba(40, 40, 64, 0.6)', /* Translucent bg */
          backdropFilter: 'blur(10px) saturate(180%)',
          WebkitBackdropFilter: 'blur(10px) saturate(180%)', /* Safari support */
        }}
      >
        {/* Top Banner Bar - Streak and Progress */}
        <div className="p-4 grid grid-cols-2 md:grid-cols-2 gap-y-4 md:gap-y-0 items-center justify-between">
          {/* Streak Indicator */}
          <div className="flex items-center justify-center md:justify-start">
            <span className="text-xl font-bold text-[#EF4444] animate-pulse-once">🔥 {appData.streak}</span>
            <span className="ml-2 text-lg text-[#E0E0E0]">Day Streak</span>
          </div>

          {/* Progress & Expand */}
          <div className="flex items-center justify-center md:justify-end">
            <span className="text-xl font-bold text-[#4CAF50] animate-pulse-once">✅ {currentWeekCompletionPercentage}% Done</span>
          </div>
        </div>

        {/* Gradient Line Separator */}
        <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-[#5C7AEA] to-transparent my-2"></div>

        {/* Navigation Section (Week & Day) - Redesigned for 3-column explicit structure */}
        <div className="flex flex-col gap-2 p-2">
          {/* Week Navigation - Explicit 3-column grid */}
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2"> {/* auto for button width, 1fr for flexible center */}
            <div className="flex justify-start"> {/* Left column */}
              <button
                onClick={() => navigateWeeks(-1)}
                className="p-2 rounded-full bg-[#4A5568] text-white hover:bg-[#3C4454] transition-all duration-200 ease-in-out transform hover:scale-110 active:scale-90 shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#5C7AEA]"
                aria-label="Previous week"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            {/* Center column for week info */}
            <div className="flex justify-center text-center">
              <span className="text-[#E0E0E0] text-xl font-bold">{currentWeekInfo.display} | {currentWeekInfo.year}</span>
            </div>
            <div className="flex justify-end"> {/* Right column */}
              <button
                onClick={() => navigateWeeks(1)}
                className="p-2 rounded-full bg-[#4A5568] text-white hover:bg-[#3C4454] transition-all duration-200 ease-in-out transform hover:scale-110 active:scale-90 shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#5C7AEA]"
                aria-label="Next week"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>

          {/* Day Navigation - Explicit 3-column grid */}
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 pt-2"> {/* auto for button width, 1fr for flexible center */}
            <div className="flex justify-start"> {/* Left column */}
              <button
                onClick={() => navigateDays(-1)}
                className="p-2 rounded-full bg-[#4A5568] text-white hover:bg-[#3C4454] transition-all duration-200 ease-in-out transform hover:scale-110 active:scale-90 shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#5C7AEA]"
                aria-label="Previous day"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            {/* Center column for day info */}
            <div className="flex justify-center text-center">
              <span className="text-xl font-bold text-[#E0E0E0] tracking-wide">
                {appData.currentDayName}, {getMonthDay(getDayDate(appData.currentWeekId, appData.currentDayName))}
              </span>
            </div>
            <div className="flex justify-end"> {/* Right column */}
              <button
                onClick={() => navigateDays(1)}
                className="p-2 rounded-full bg-[#4A5568] text-white hover:bg-[#3C4454] transition-all duration-200 ease-in-out transform hover:scale-110 active:scale-90 shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#5C7AEA]"
                aria-label="Next day"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>


      {/* Main Content - Day View */}
      <main className="w-full max-w-xl bg-[#282840] rounded-xl shadow-lg p-4 flex-grow relative">
        {isHistoricalView && (
          <p className="mb-4 text-center text-sm text-[#9E9E9E]">(Historical View)</p>
        )}
        <DayView
          tasks={currentWeekData?.template[appData.currentDayName] || []}
          completedTaskIds={currentWeekData?.completions[appData.currentDayName] || []}
          onToggleCompletion={handleToggleTaskCompletion}
          onEditTaskText={handleEditTaskText}
          onDeleteTask={handleDeleteTask}
          onReorderTasks={handleReorderTasks}
          onExpandTask={openExpandTaskModal} // Pass the new handler
          isHistoricalView={isHistoricalView}
          categories={CATEGORIES}
          dayName={appData.currentDayName} // Pass dayName for drag/drop context
        />

        {!isHistoricalView && (
          <button
            onClick={() => openAddTaskModal(appData.currentDayName)}
            className="mt-6 w-full py-3 bg-[#5C7AEA] text-white font-bold rounded-xl shadow-md hover:bg-[#4A6CD5] transition-all duration-200 ease-in-out transform hover:scale-102 active:scale-98 hover:shadow-lg"
            aria-label="Add new task"
          >
            Add Task
          </button>
        )}
      </main>

      {/* Add Task Modal */}
      {isModalOpen && modalType === 'add-task' && (
        <AddTaskModal
          dayName={modalPayload?.dayName}
          onClose={closeModals}
          onAddTask={handleAddTask}
          categories={CATEGORIES}
        />
      )}

      {/* Expand Task Modal */}
      {isModalOpen && modalType === 'expand-task' && (
        <ExpandTaskModal
          task={modalPayload?.task}
          onClose={closeModals}
          onAddSubtask={handleAddTask} // Reuse handleAddTask for adding subtasks
          dayName={appData.currentDayName}
          categories={CATEGORIES}
        />
      )}

      {/* Message Modal */}
      {isModalOpen && modalType === 'message' && (
        <MessageModal
          message={modalMessage}
          onClose={closeModals}
        />
      )}
    </div>
  );
}

// --- DayView Component ---
const DayView = ({
  tasks,
  completedTaskIds,
  onToggleCompletion,
  onEditTaskText,
  onDeleteTask,
  onReorderTasks,
  onExpandTask, // New prop
  isHistoricalView,
  categories,
  dayName,
}) => {
  const [draggingItem, setDraggingItem] = useState(null);

  const handleDragStart = (e, index) => {
    if (isHistoricalView) {
      e.preventDefault();
      return;
    }
    setDraggingItem(tasks[index]);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index);
    e.currentTarget.classList.add('opacity-50', 'translate-y-[-4px]', 'shadow-xl'); // Lift effect and shadow
  };

  const handleDragOver = (e) => {
    e.preventDefault(); // Allow drop
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    if (!draggingItem || isHistoricalView) return;

    const sourceIndex = tasks.findIndex(task => task.id === draggingItem.id);
    if (sourceIndex === -1 || sourceIndex === targetIndex) return;

    const newTasks = [...tasks];
    const [movedTask] = newTasks.splice(sourceIndex, 1);
    newTasks.splice(targetIndex, 0, movedTask);

    onReorderTasks(dayName, newTasks);
    e.currentTarget.classList.remove('opacity-50', 'translate-y-[-4px]', 'shadow-xl');
    setDraggingItem(null);
  };

  const handleDragEnd = (e) => {
    e.currentTarget.classList.remove('opacity-50', 'translate-y-[-4px]', 'shadow-xl');
    setDraggingItem(null);
  };

  return (
    <ul className="space-y-3 p-2 bg-[#1A1A2E] rounded-lg min-h-[300px]"> {/* Darker background for task list */}
      {tasks.length === 0 ? (
        <p className="text-center text-[#9E9E9E] py-10">No tasks for today. Add some!</p>
      ) : (
        tasks.map((task, index) => (
          <li
            key={task.id}
            draggable={!isHistoricalView}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            className="rounded-lg shadow-md bg-[#282840] p-3 flex items-center gap-3 border-l-4 transition-all duration-200 ease-in-out" // Darker task card background
            style={{ borderColor: categories[task.category]?.color || categories.others.color }}
          >
            <TaskItem
              task={task}
              isCompleted={completedTaskIds.includes(task.id)}
              onToggleCompletion={onToggleCompletion}
              onEditTaskText={onEditTaskText}
              onDeleteTask={onDeleteTask}
              onExpandTask={onExpandTask} // Pass through
              isHistoricalView={isHistoricalView}
              categoryInfo={categories[task.category] || categories.others}
              dayName={dayName}
            />
          </li>
        ))
      )}
    </ul>
  );
};

// --- TaskItem Component ---
const TaskItem = ({
  task,
  isCompleted,
  onToggleCompletion,
  onEditTaskText,
  onDeleteTask,
  onExpandTask, // New prop
  isHistoricalView,
  categoryInfo,
  dayName,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(task.text);
  const inputRef = React.useRef(null);

  const handleTextClick = () => {
    if (!isHistoricalView) {
      setIsEditing(true);
    }
  };

  const handleTextChange = (e) => {
    setEditText(e.target.value);
  };

  const handleTextBlur = () => {
    setIsEditing(false);
    if (editText.trim() !== '' && editText !== task.text) {
      onEditTaskText(dayName, task.id, editText);
    } else {
      setEditText(task.text); // Revert if empty or no change
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      inputRef.current.blur(); // Trigger blur to save
    }
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      // Place cursor at the end
      inputRef.current.setSelectionRange(editText.length, editText.length);
    }
  }, [isEditing, editText]);

  // Use a subtle translucent background for meal tasks
  const mealBgStyle = task.category === 'meal' ? { backgroundColor: 'rgba(255, 255, 255, 0.08)' } : {};

  return (
    <>
      <button
        onClick={() => !isHistoricalView && onToggleCompletion(dayName, task.id)}
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border-2
          ${isCompleted ? 'bg-[#4CAF50] border-[#4CAF50] text-white' : 'bg-[#282840] border-[#4A5568] text-transparent'}
          ${isHistoricalView ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:bg-green-600 transition-colors duration-200 ease-in-out transform active:scale-95'}`}
        aria-label={isCompleted ? "Mark as uncompleted" : "Mark as completed"}
        disabled={isHistoricalView}
      >
        {isCompleted && (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 transition-all duration-300 ease-out" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )}
      </button>

      <div className={`flex-1 flex flex-col sm:flex-row sm:items-center rounded-md p-2`} style={mealBgStyle}>
        <div className="flex items-center mb-1 sm:mb-0">
          <span className="mr-2 text-xl flex-shrink-0">{categoryInfo.emoji}</span>
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editText}
              onChange={handleTextChange}
              onBlur={handleTextBlur}
              onKeyPress={handleKeyPress}
              className="w-full p-1 border-b-2 border-[#5C7AEA] focus:outline-none bg-transparent text-[#E0E0E0]"
              style={{ color: '#E0E0E0' }} // Ensure text color is light
            />
          ) : (
            <span
              className={`flex-1 text-base ${isCompleted ? 'line-through text-[#9E9E9E] transition-all duration-300 ease-out' : 'text-[#E0E0E0]'} ${!isHistoricalView ? 'cursor-pointer' : ''}`}
              onClick={handleTextClick}
              aria-label="Edit task"
            >
              {task.text}
            </span>
          )}
        </div>
      </div>

      {!isHistoricalView && (
        <div className="flex-shrink-0 flex space-x-2 ml-auto"> {/* Buttons grouped and aligned right */}
          <button
            onClick={() => onExpandTask(task)}
            className="p-2 text-[#5C7AEA] hover:bg-[#202030] rounded-full transition-colors duration-200 ease-in-out transform active:scale-95"
            aria-label="Expand task"
          >
            ✨
          </button>
          <button
            onClick={() => onDeleteTask(dayName, task.id)}
            className="p-2 text-red-500 hover:bg-red-900 rounded-full transition-colors duration-200 ease-in-out transform active:scale-95"
            aria-label="Delete task"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm2 3a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm2 3a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
          </button>
        </div>
      )}
    </>
  );
};


// --- AddTaskModal Component ---
const AddTaskModal = ({ dayName, onClose, onAddTask, categories }) => {
  const [taskText, setTaskText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(Object.keys(categories)[0]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (taskText.trim()) {
      onAddTask(dayName, taskText.trim(), selectedCategory);
      setTaskText('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50 animate-fade-in"> {/* Darker overlay, fade-in animation */}
      <div className="bg-[#282840] rounded-xl p-6 shadow-xl w-full max-w-sm animate-scale-in"> {/* Darker modal, scale-in animation */}
        <h3 className="text-2xl font-bold mb-4 text-center text-[#E0E0E0]">Add New Task for {dayName}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="task-text" className="block text-[#E0E0E0] text-sm font-medium mb-1">
              Task Description
            </label>
            <input
              id="task-text"
              type="text"
              value={taskText}
              onChange={(e) => setTaskText(e.target.value)}
              className="w-full p-3 border border-[#4A5568] rounded-lg focus:ring-2 focus:ring-[#5C7AEA] focus:border-transparent bg-[#1E1E2F] text-[#E0E0E0]"
              placeholder="e.g., Go to gym, Prepare dinner"
              required
            />
          </div>
          <div>
            <label htmlFor="task-category" className="block text-[#E0E0E0] text-sm font-medium mb-1">
              Category
            </label>
            <select
              id="task-category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full p-3 border border-[#4A5568] rounded-lg bg-[#1E1E2F] text-[#E0E0E0] focus:ring-2 focus:ring-[#5C7AEA] focus:border-transparent"
            >
              {Object.entries(categories).map(([key, value]) => (
                <option key={key} value={key} style={{backgroundColor: '#282840', color: '#E0E0E0'}}> {/* Options style for dark theme */}
                  {value.emoji} {value.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-[#4A5568] text-white font-semibold hover:bg-[#3C4454] transition-all duration-200 ease-in-out transform active:scale-95 shadow-md hover:shadow-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-[#5C7AEA] text-white font-bold hover:bg-[#4A6CD5] transition-all duration-200 ease-in-out transform active:scale-95 shadow-md hover:shadow-lg"
            >
              Add Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- ExpandTaskModal Component (NEW) ---
const ExpandTaskModal = ({ task, dayName, onClose, onAddSubtask, categories }) => {
  const [expandedContent, setExpandedContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  const generateTaskBreakdown = async () => {
    setIsGenerating(true);
    setError('');
    setExpandedContent(''); // Clear previous content

    const prompt = `Break down the following high-level task into 3-5 actionable, smaller sub-tasks. List them as a bulleted list. Each sub-task should be concise.\n\nTask: "${task.text}"`;

    try {
      let chatHistory = [];
      chatHistory.push({ role: "user", parts: [{ text: prompt }] });
      const payload = { contents: chatHistory };
      const apiKey = ""; // Canvas will provide
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const text = result.candidates[0].content.parts[0].text;
        setExpandedContent(text.trim());
      } else {
        setError('No content generated or unexpected response structure.');
      }
    } catch (err) {
      console.error('Error generating task breakdown:', err);
      setError(`Failed to generate breakdown: ${err.message}. Please try again.`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddSubtasks = () => {
    if (!expandedContent) {
      setError("No subtasks to add. Please generate a breakdown first.");
      return;
    }

    // Parse the bulleted list into individual tasks
    const subtasks = expandedContent.split('\n')
                                   .map(line => line.replace(/^[*-]\s*/, '').trim()) // Remove bullet points
                                   .filter(line => line.length > 0); // Filter out empty lines

    if (subtasks.length === 0) {
      setError("No valid subtasks found in the generated content.");
      return;
    }

    subtasks.forEach(subtaskText => {
      onAddSubtask(dayName, subtaskText, task.category); // Add each subtask with parent's category
    });
    onClose(); // Close modal after adding
  };


  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-[#282840] rounded-xl p-6 shadow-xl w-full max-w-lg animate-scale-in">
        <h3 className="text-2xl font-bold mb-4 text-center text-[#E0E0E0]">Expand Task</h3>
        <p className="text-base text-[#B0B0B0] mb-4">
          Original Task: <span className="font-semibold text-[#E0E0E0]">"{task.text}"</span>
        </p>

        {error && <p className="text-red-400 text-center mb-3">{error}</p>}

        <div className="mb-4">
          <button
            onClick={generateTaskBreakdown}
            disabled={isGenerating}
            className="w-full py-3 bg-[#5C7AEA] text-white font-bold rounded-xl shadow-md hover:bg-[#4A6CD5] transition-all duration-200 ease-in-out transform hover:scale-102 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generating...
              </span>
            ) : (
              '✨ Generate Breakdown'
            )}
          </button>
        </div>

        {expandedContent && (
          <div className="bg-[#1A1A2E] p-4 rounded-lg border border-[#4A5568] mb-4 overflow-auto max-h-48 text-[#E0E0E0]">
            <h4 className="font-semibold mb-2 text-lg">Suggested Sub-tasks:</h4>
            <pre className="whitespace-pre-wrap text-sm">{expandedContent}</pre>
          </div>
        )}

        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#4A5568] text-white font-semibold hover:bg-[#3C4454] transition-all duration-200 ease-in-out transform active:scale-95 shadow-md hover:shadow-lg"
          >
            Close
          </button>
          <button
            onClick={handleAddSubtasks}
            disabled={!expandedContent || isGenerating}
            className="px-5 py-2 rounded-xl bg-[#5C7AEA] text-white font-bold hover:bg-[#4A6CD5] transition-all duration-200 ease-in-out transform active:scale-95 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add as Subtasks
          </button>
        </div>
      </div>
    </div>
  );
};


// --- MessageModal Component (for alert/confirm replacements) ---
const MessageModal = ({ message, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50 animate-fade-in"> {/* Darker overlay, fade-in animation */}
      <div className="bg-[#282840] rounded-xl p-6 shadow-xl w-full max-w-sm animate-scale-in"> {/* Darker modal, scale-in animation */}
        <h3 className="text-xl font-bold mb-4 text-[#E0E0E0]">Notification</h3>
        <p className="mb-6 text-[#E0E0E0]">{message}</p>
        <button
          onClick={onClose}
          className="px-6 py-2 rounded-xl bg-[#5C7AEA] text-white font-bold hover:bg-[#4A6CD5] transition-all duration-200 ease-in-out transform active:scale-95 shadow-md hover:shadow-lg"
        >
          OK
        </button>
      </div>
    </div>
  );
};

export default App;
