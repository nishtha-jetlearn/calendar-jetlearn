import React, { useState, useMemo, useRef, useEffect } from 'react';
import { FaSearch, FaGraduationCap, FaChevronDown, FaHistory, FaTimes, FaCheck, FaMapMarkerAlt, FaIdCard } from 'react-icons/fa';
import { useDebounce } from '../hooks/useDebounce';

const EnhancedStudentSearch = ({
  students,
  selectedStudent,
  onStudentSelect,
  loading = false,
  error = null
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [searchHistory, setSearchHistory] = useState([]);
  const debouncedSearch = useDebounce(searchTerm, 200);
  
  const searchInputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Enhanced filtering with multiple criteria
  const filteredStudents = useMemo(() => {
    if (!debouncedSearch.trim()) {
      return students.slice(0, 10); // Show top 10 students when no search
    }

    const searchLower = debouncedSearch.toLowerCase().trim();
    
    return students
      .filter(student => {
        // Search by deal_name (starts with)
        const dealNameMatch = student.deal_name && 
          student.deal_name.toLowerCase().startsWith(searchLower);
        
        // Search by name (starts with) 
        const nameMatch = student.name && 
          student.name.toLowerCase().startsWith(searchLower);
        
        // Search by deal_name (contains)
        const dealNameContainsMatch = student.deal_name && 
          student.deal_name.toLowerCase().includes(searchLower);
        
        // Search by name (contains)
        const nameContainsMatch = student.name && 
          student.name.toLowerCase().includes(searchLower);
        
        // Search by jetlearner_id
        const idMatch = student.jetlearner_id && 
          student.jetlearner_id.toLowerCase().includes(searchLower);
        
        // Search by country
        const countryMatch = student.country && 
          student.country.toLowerCase().includes(searchLower);
        
        // Search by words in name
        const dealNameWordsMatch = student.deal_name && 
          student.deal_name.toLowerCase().split(' ').some(word => 
            word.trim().startsWith(searchLower)
          );
        
        const nameWordsMatch = student.name && 
          student.name.toLowerCase().split(' ').some(word => 
            word.trim().startsWith(searchLower)
          );

        return dealNameMatch || nameMatch || dealNameContainsMatch || nameContainsMatch || 
               idMatch || countryMatch || dealNameWordsMatch || nameWordsMatch;
      })
      .sort((a, b) => {
        const aName = (a.deal_name || a.name || '').toLowerCase();
        const bName = (b.deal_name || b.name || '').toLowerCase();
        const searchLower = debouncedSearch.toLowerCase();
        
        // Prioritize exact name matches
        if (aName.startsWith(searchLower) && !bName.startsWith(searchLower)) return -1;
        if (!aName.startsWith(searchLower) && bName.startsWith(searchLower)) return 1;
        
        // Then alphabetical
        return aName.localeCompare(bName);
      })
      .slice(0, 25); // Limit to 25 results
  }, [debouncedSearch, students]);

  // Categorize results
  const categorizedResults = useMemo(() => {
    if (!debouncedSearch.trim()) {
      return {
        recent: searchHistory.slice(0, 3),
        suggested: filteredStudents.slice(0, 7)
      };
    }

    const searchLower = debouncedSearch.toLowerCase();
    const exactMatches = [];
    const nameMatches = [];
    const idMatches = [];
    const otherMatches = [];

    filteredStudents.forEach(student => {
      const studentName = (student.deal_name || student.name || '').toLowerCase();
      const studentId = (student.jetlearner_id || '').toLowerCase();
      
      if (studentName === searchLower) {
        exactMatches.push(student);
      } else if (studentName.startsWith(searchLower)) {
        nameMatches.push(student);
      } else if (studentId.includes(searchLower)) {
        idMatches.push(student);
      } else {
        otherMatches.push(student);
      }
    });

    return {
      exact: exactMatches,
      names: nameMatches,
      ids: idMatches,
      others: otherMatches
    };
  }, [debouncedSearch, filteredStudents, searchHistory]);

  // Handle student selection
  const handleStudentSelect = (student) => {
    // Show student name in search field, but preserve full student object
    setSearchTerm(student.deal_name || student.name || '');
    setIsDropdownOpen(false);
    setFocusedIndex(-1);
    
    // Add to search history with full student object
    setSearchHistory(prev => {
      const filtered = prev.filter(s => s.jetlearner_id !== student.jetlearner_id);
      return [student, ...filtered].slice(0, 5);
    });
    
    // Pass full student object to parent
    console.log('🔍 Student selected:', student.deal_name || student.name);
    onStudentSelect(student);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    const allResults = [
      ...(categorizedResults.recent || []),
      ...(categorizedResults.exact || []),
      ...(categorizedResults.names || []),
      ...(categorizedResults.ids || []),
      ...(categorizedResults.others || [])
    ];

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => 
          prev < allResults.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => 
          prev > 0 ? prev - 1 : allResults.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0 && allResults[focusedIndex]) {
          handleStudentSelect(allResults[focusedIndex]);
        }
        break;
      case 'Escape':
        setIsDropdownOpen(false);
        setFocusedIndex(-1);
        searchInputRef.current?.blur();
        break;
    }
  };

  // Handle input change
  const handleInputChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    setIsDropdownOpen(true);
    setFocusedIndex(-1);
  };

  // Handle input focus
  const handleInputFocus = () => {
    setIsDropdownOpen(true);
  };

  // Clear search
  const clearSearch = () => {
    setSearchTerm('');
    setIsDropdownOpen(false);
    setFocusedIndex(-1);
    onStudentSelect(null);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
        setFocusedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update search term when selected student changes externally
  useEffect(() => {
    if (selectedStudent) {
      setSearchTerm(selectedStudent.deal_name || selectedStudent.name || '');
    } else {
      setSearchTerm('');
    }
  }, [selectedStudent]);

  const renderStudentItem = (student, index, category = '') => {
    const isSelected = selectedStudent?.jetlearner_id === student.jetlearner_id;
    const isFocused = index === focusedIndex;
    const displayName = student.deal_name || student.name || 'Unknown';
    
    return (
      <div
        key={`${category}-${student.jetlearner_id || student.id}`}
        onClick={() => handleStudentSelect(student)}
        className={`
          p-3 cursor-pointer transition-all duration-150 border-l-4
          ${isFocused ? 'bg-purple-50 border-l-purple-500' : 'border-l-transparent hover:bg-gray-50'}
          ${isSelected ? 'bg-purple-100 border-l-purple-600' : ''}
        `}
      >
        <div className="flex items-center gap-3">
          <div className={`
            w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
            ${isSelected ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-600'}
          `}>
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="font-medium text-gray-900 text-sm">
              {displayName}
              {isSelected && <FaCheck className="inline ml-2 text-purple-600" size={12} />}
            </div>
            <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                            {student.jetlearner_id && (
                <span className="flex items-center gap-1">
                  <FaIdCard size={10} />
                  {student.jetlearner_id}
                </span>
              )}
              {student.country && (
                <span className="flex items-center gap-1">
                  <FaMapMarkerAlt size={10} />
                  {student.country}
                </span>
              )}
              {student.age && <span>Age: {student.age}</span>}
            </div>
            {student.isBookedStudent && (
              <div className="text-xs text-green-600 font-medium mt-1">
                Previously Booked
              </div>
            )}
          </div>
          {category === 'recent' && (
            <FaHistory className="text-gray-400" size={12} />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <FaSearch className="h-4 w-4 text-gray-400" />
        </div>
        <input
          ref={searchInputRef}
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder="Search students by name, ID, or country..."
          disabled={loading}
          className={`
            w-full pl-10 pr-10 py-3 border rounded-lg text-sm
            focus:ring-2 focus:ring-purple-500 focus:border-purple-500
            ${loading ? 'bg-gray-50 cursor-not-allowed' : 'bg-white'}
            ${error ? 'border-red-300' : 'border-gray-300'}
            transition-all duration-200
          `}
        />
        
        {/* Loading/Clear button */}
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
          {loading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
          ) : searchTerm ? (
            <button
              onClick={clearSearch}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <FaTimes size={14} />
            </button>
          ) : (
            <FaChevronDown 
              className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
                isDropdownOpen ? 'rotate-180' : ''
              }`} 
            />
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mt-1 text-xs text-red-600 bg-red-50 p-2 rounded">
          {error}
        </div>
      )}

      {/* Dropdown */}
      {isDropdownOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto">
          {!debouncedSearch.trim() ? (
            /* No search term - show recent and suggested */
            <>
              {searchHistory.length > 0 && (
                <div>
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                    <span className="text-xs font-medium text-gray-600 flex items-center gap-2">
                      <FaHistory size={10} />
                      Recent Searches
                    </span>
                  </div>
                  {categorizedResults.recent.map((student, index) => 
                    renderStudentItem(student, index, 'recent')
                  )}
                </div>
              )}
              
              {categorizedResults.suggested.length > 0 && (
                <div>
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                    <span className="text-xs font-medium text-gray-600">
                      Suggested Students
                    </span>
                  </div>
                  {categorizedResults.suggested.map((student, index) => 
                    renderStudentItem(student, index + (searchHistory.length), 'suggested')
                  )}
                </div>
              )}
              
              {searchHistory.length === 0 && categorizedResults.suggested.length === 0 && (
                <div className="p-4 text-center text-gray-500">
                  <div className="text-sm">Start typing to search students</div>
                  <div className="text-xs mt-1">Search by name, ID, or country</div>
                </div>
              )}
            </>
          ) : (
            /* Search results */
            <>
              {categorizedResults.exact?.length > 0 && (
                <div>
                  <div className="px-3 py-2 bg-green-50 border-b border-green-100">
                    <span className="text-xs font-medium text-green-700">
                      Exact Match
                    </span>
                  </div>
                  {categorizedResults.exact.map((student, index) => 
                    renderStudentItem(student, index, 'exact')
                  )}
                </div>
              )}
              
              {categorizedResults.names?.length > 0 && (
                <div>
                  <div className="px-3 py-2 bg-purple-50 border-b border-purple-100">
                    <span className="text-xs font-medium text-purple-700">
                      Name Matches
                    </span>
                  </div>
                  {categorizedResults.names.map((student, index) => 
                    renderStudentItem(student, index + (categorizedResults.exact?.length || 0), 'names')
                  )}
                </div>
              )}
              
              {categorizedResults.ids?.length > 0 && (
                <div>
                  <div className="px-3 py-2 bg-blue-50 border-b border-blue-100">
                    <span className="text-xs font-medium text-blue-700">
                      ID Matches
                    </span>
                  </div>
                  {categorizedResults.ids.map((student, index) => 
                    renderStudentItem(
                      student, 
                      index + (categorizedResults.exact?.length || 0) + (categorizedResults.names?.length || 0), 
                      'ids'
                    )
                  )}
                </div>
              )}
              
              {categorizedResults.others?.length > 0 && (
                <div>
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                    <span className="text-xs font-medium text-gray-600">
                      Other Matches
                    </span>
                  </div>
                  {categorizedResults.others.map((student, index) => 
                    renderStudentItem(
                      student, 
                      index + (categorizedResults.exact?.length || 0) + (categorizedResults.names?.length || 0) + (categorizedResults.ids?.length || 0), 
                      'others'
                    )
                  )}
                </div>
              )}
              
              {filteredStudents.length === 0 && (
                <div className="p-4 text-center text-gray-500">
                  <div className="text-sm">No students found</div>
                  <div className="text-xs mt-1">Try searching by name, ID, or country</div>
                </div>
              )}
            </>
          )}
          
          {/* Footer */}
          {filteredStudents.length > 0 && (
            <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500 text-center">
              {debouncedSearch.trim() ? 
                `${filteredStudents.length} student${filteredStudents.length !== 1 ? 's' : ''} found` :
                'Start typing to search students'
              }
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EnhancedStudentSearch; 