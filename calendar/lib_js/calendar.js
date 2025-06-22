
Calendar = new Object();

// unix timestamp should be in seconds example 1357038000 01/01/2013
// in JS unix stamps are in milliseconds so the one from php has to be multiplied by 1000
Calendar.printRange = function (startDateUnix, endDateUnix) {
    var oContainer = document.getElementById("calendar-container");
    oContainer.innerHTML = "";

    var month = 60 * 60 * 24 * 30

    startDateUnix = startDateUnix
    endDateUnix = endDateUnix + month

    var endDate = new Date(endDateUnix * 1000);
    var actualDate = new Date(startDateUnix * 1000);

    oContainer.appendChild(Calendar.printMonth(actualDate.getFullYear(), actualDate.getMonth() + 1));

    while (!(actualDate.getFullYear() == endDate.getFullYear() && actualDate.getMonth() == endDate.getMonth())) {
        actualDate.setMonth(actualDate.getMonth() + 1);
        oContainer.appendChild(Calendar.printMonth(actualDate.getFullYear(), actualDate.getMonth() + 1));
    }
}

Calendar.addEventList = function () {
    json = '({"items":[' +
        '{   "type":"note","id":"0","date":"1379886340","title":"Meeting",},' +
        '{   "type":"note","id":"1","date":"1379976340","title":"Thing", },' +
        '{   "type":"note","id":"1","date":"1381886340","title":"Thing 2",},' +
        '{   "type":"note","id":"5","date":"1381896340","title":"Thing 5",},' +
        '{   "type":"note","id":"2","date":"1383886340","title":"New event",},' +
        '{   "type":"note","id":"3","date":"1387856340","title":"Birthday", },' +
        ']})';

    var dataContent = eval(json);
    Elem = dataContent.items;

    var length = Elem.length;
    for (i = 0; i < length; i++) {
        Calendar.addEvent(Elem[i].date, Elem[i].title);
    }
}

Calendar.addEvent = function (date, title) {
    var oDate = new Date(date * 1000);
    var timeText = oDate.getHours() + ":" + oDate.getMinutes();

    var dateID = 'c_day_' + oDate.getFullYear() + '_' + (oDate.getMonth() + 1) + '_' + oDate.getDate();
    var oDay = document.getElementById(dateID);
    oDay.className = "c_dayEvents";
    oDay.title += timeText + " - " + title + "\n";

}

// prints one month Calendar specified by the year, and the month
// month input is the number of the month for example 1-january , 2-february etc ; (2013,1) is January 2013
Calendar.printMonth = function (year, month) {
    month--; // to get the proper month. By default 
    // var one_day = 1000 * 60 * 60 * 24;
    var firstDay = new Date(year, month, 1, 12, 0, 0);
    var today = new Date();
    var firstWeek = true;
    var day = firstDay.getDay();
    var dayFullNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    var dayShortNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    var monthFullNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    if (day == 0) day = 7;

    var actualDay = Calendar.addDay(firstDay, (day - 1) * -1);

    var oTable = document.createElement("table");
    oTable.className = "c_month";

    // Setting up the day headings 
    let oRow = oTable.insertRow(-1);
    oRow.className = "c_columnHeading";

    for (var i = 0; i < 7; i++) {
        var oHeading = oRow.insertCell(-1);
        var oAnchor = document.createElement("a");
        oAnchor.innerHTML = dayShortNames[i];
        oAnchor.href = "#";
        oHeading.appendChild(oAnchor);
    }

    // printing the days before the month
    while (actualDay.getMonth() != month) {
        if (actualDay.getDay() == 1) {
            oRow = oTable.insertRow(-1);
            oRow.className = firstWeek ? "c_week c_first_week" : "c_week";
        }
        firstWeek = false;
        var oCell = oRow.insertCell(-1);
        oCell.className = "c_" + dayFullNames[actualDay.getDay()];
        var oAnchor = document.createElement("a");
        oAnchor.className = "c_dayOtherMonth";
        oAnchor.href = "#";
        oAnchor.innerHTML = actualDay.getDate();
        oCell.appendChild(oAnchor);

        // adding a day
        actualDay.setDate(actualDay.getDate() + 1);
    }

    // printing the actual month
    while (actualDay.getMonth() == month) {
        var elementIdName = 'c_day_' + actualDay.getFullYear() + '_' + (actualDay.getMonth() + 1) + '_' + actualDay.getDate();
        if (actualDay.getDay() == 1) {
            oRow = oTable.insertRow(-1);
            oRow.className = firstWeek ? "c_week c_first_week" : "c_week";
        }
        firstWeek = false;
        var oCell = oRow.insertCell(-1);
        oCell.className = "c_" + dayFullNames[actualDay.getDay()];
        var oAnchor = document.createElement("a");
        if (actualDay.getDate() == today.getDate() && actualDay.getMonth() == today.getMonth() && actualDay.getFullYear() == today.getFullYear())
            oAnchor.className = "c_dayToday";
        else
            oAnchor.className = "c_dayEmpty";
        oAnchor.href = "#" + elementIdName;
        oAnchor.id = elementIdName;
        oAnchor.innerHTML = actualDay.getDate();

        oCell.appendChild(oAnchor);
        // adding a day
        actualDay.setDate(actualDay.getDate() + 1);
    }

    // printing the days after the month
    while (actualDay.getDay() != 1) {
        if (actualDay.getDay() == 1) {
            oRow = oTable.insertRow(-1);
            oRow.className = firstWeek ? "c_week c_first_week" : "c_week";
        }
        firstWeek = false;

        var oCell = oRow.insertCell(-1);
        oCell.className = "c_" + dayFullNames[actualDay.getDay()];
        var oAnchor = document.createElement("a");
        oAnchor.className = "c_dayOtherMonth";
        oAnchor.href = "#";
        oAnchor.innerHTML = actualDay.getDate();

        oCell.appendChild(oAnchor);
        // adding a day
        actualDay.setDate(actualDay.getDate() + 1);
    }

    oRow.className = "c_week c_last_week";

    var oYear = document.createElement("a");
    oYear.href = "#";
    oYear.className = "c_yearTitle";
    oYear.innerHTML = year;

    var oMonth = document.createElement("a");
    oMonth.href = "#";
    oMonth.className = "c_monthTitle";
    oMonth.innerHTML = monthFullNames[firstDay.getMonth()];

    var oContainer = document.createElement("div");
    oContainer.className = "calendarContainer";

    oContainer.appendChild(oMonth);
    oContainer.appendChild(oYear);
    oContainer.appendChild(oTable);

    return oContainer;
}


// adds a day to the date object received. 
// Returns a new date object.
Calendar.addDay = function (date, days) {
    var one_day = 1000 * 60 * 60 * 24;
    var newDate = new Date();
    newDate.setTime(date.getTime() + one_day * days);
    return newDate;
}



