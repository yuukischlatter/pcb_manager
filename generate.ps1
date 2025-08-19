# Fresh PowerShell script to create robot-arm-segment-pcb-system with perfect JSON format
param(
    [Parameter(Mandatory=$true)]
    [string]$RootPath
)

function Create-ConnectionsJson {
    param($connections)
    
    $json = "{"
    $json += "`n  `"connections`": ["
    
    for ($i = 0; $i -lt $connections.Count; $i++) {
        $conn = $connections[$i]
        $json += "`n    {"
        $json += "`n      `"target`": `"$($conn.target)`","
        $json += "`n      `"type`": `"$($conn.type)`","
        $json += "`n      `"interface`": `"$($conn.interface)`","
        $json += "`n      `"signals`": ["
        
        for ($j = 0; $j -lt $conn.signals.Count; $j++) {
            $json += "`"$($conn.signals[$j])`""
            if ($j -lt $conn.signals.Count - 1) { $json += ", " }
        }
        
        $json += "],"
        $json += "`n      `"description`": `"$($conn.description)`""
        $json += "`n    }"
        
        if ($i -lt $connections.Count - 1) { $json += "," }
    }
    
    $json += "`n  ]"
    $json += "`n}"
    
    return $json
}

# Define all modules and their connections
$AllModules = @{
    "robot-arm-segment-pcb-system" = @(
        @{ target="pcb1-high-power-board"; type="system_bus"; interface="System Bus"; signals=@("Power","Control"); description="High power motor control board" },
        @{ target="pcb2-low-power-board"; type="system_bus"; interface="System Bus"; signals=@("Communication","Sensors"); description="Low power communication and sensor hub" },
        @{ target="pcb3-force-torque-assembly"; type="sensor_bus"; interface="Sensor Bus"; signals=@("Force Data","Torque Data"); description="Force and torque sensing assembly" }
    )
    "pcb1-high-power-board" = @(
        @{ target="pcb2-low-power-board"; type="communication"; interface="Inter-PCB Bus"; signals=@("Data","Control"); description="Communication with low power board" },
        @{ target="pcb3-force-torque-assembly"; type="sensor_interface"; interface="Sensor Interface"; signals=@("Force Data"); description="Force torque sensor data" }
    )
    "pcb1-high-power-board/power-management" = @(
        @{ target="../pcb2-low-power-board"; type="5V_power"; interface="Power Connector"; signals=@("5V","GND"); description="5V power supply to low power board" }
    )
    "pcb1-high-power-board/power-management/voltage-conversion" = @(
        @{ target="../motor-current-distribution"; type="24V_power"; interface="Power Rail"; signals=@("24V","GND"); description="24V power supply to motor current distribution" },
        @{ target="../hp-to-lp-conversion"; type="5V_power"; interface="Power Rail"; signals=@("5V","GND"); description="5V power supply to HP-to-LP converter" }
    )
    "pcb1-high-power-board/power-management/motor-current-distribution" = @(
        @{ target="../../motor-control"; type="motor_power"; interface="Motor Power Rail"; signals=@("Motor+","Motor-","GND"); description="Motor power distribution to motor control" },
        @{ target="../voltage-conversion"; type="24V_power"; interface="Power Rail"; signals=@("24V","GND"); description="24V power input from voltage conversion" }
    )
    "pcb1-high-power-board/power-management/hp-to-lp-conversion" = @(
        @{ target="../../pcb2-low-power-board"; type="5V_power"; interface="Power Connector"; signals=@("5V","GND"); description="5V power output to low power board" },
        @{ target="../voltage-conversion"; type="5V_power"; interface="Power Rail"; signals=@("5V","GND"); description="5V power input from voltage conversion" }
    )
    "pcb1-high-power-board/motor-control" = @(
        @{ target="../pcb2-low-power-board/communication-hub"; type="spi_communication"; interface="SPI Bus"; signals=@("MOSI","MISO","CLK","CS"); description="SPI communication with communication hub" }
    )
    "pcb1-high-power-board/motor-control/dspic-motor-control" = @(
        @{ target="../encoder-limit-switch"; type="digital_io"; interface="GPIO"; signals=@("Encoder_A","Encoder_B","Limit_Switch"); description="Encoder and limit switch signals" },
        @{ target="../../power-management/voltage-conversion"; type="5V_power"; interface="Power Rail"; signals=@("5V","GND"); description="5V power supply for MCU" }
    )
    "pcb1-high-power-board/motor-control/encoder-limit-switch" = @(
        @{ target="../dspic-motor-control"; type="digital_io"; interface="GPIO"; signals=@("Encoder_A","Encoder_B","Limit_Switch"); description="Encoder and limit switch feedback" },
        @{ target="../../pcb2-low-power-board/sensor-processing"; type="i2c_communication"; interface="I2C Bus"; signals=@("SDA","SCL"); description="I2C communication for sensor data" }
    )
    "pcb2-low-power-board" = @(
        @{ target="pcb1-high-power-board"; type="communication"; interface="Inter-PCB Bus"; signals=@("Data","Control"); description="Communication with high power board" },
        @{ target="pcb3-force-torque-assembly"; type="sensor_interface"; interface="Sensor Interface"; signals=@("Force Data","Torque Data"); description="Force torque sensor interface" }
    )
    "pcb2-low-power-board/communication-hub" = @(
        @{ target="../sensor-processing"; type="i2c_communication"; interface="I2C Bus"; signals=@("SDA","SCL"); description="I2C communication with sensor processing" },
        @{ target="../touch-interface"; type="spi_communication"; interface="SPI Bus"; signals=@("MOSI","MISO","CLK","CS"); description="SPI communication with touch interface" },
        @{ target="../../pcb1-high-power-board/motor-control"; type="spi_communication"; interface="SPI Bus"; signals=@("MOSI","MISO","CLK","CS"); description="SPI communication with motor control" }
    )
    "pcb2-low-power-board/communication-hub/main-bus" = @(
        @{ target="../inter-mcu-connection"; type="uart_communication"; interface="UART"; signals=@("TX","RX"); description="UART communication between MCUs" },
        @{ target="../../touch-interface"; type="i2c_communication"; interface="I2C Bus"; signals=@("SDA","SCL"); description="I2C communication with touch interface" },
        @{ target="../../pcb3-force-torque-assembly"; type="can_communication"; interface="CAN Bus"; signals=@("CAN_H","CAN_L"); description="CAN communication with force torque assembly" }
    )
    "pcb2-low-power-board/communication-hub/inter-mcu-connection" = @(
        @{ target="../main-bus"; type="uart_communication"; interface="UART"; signals=@("TX","RX"); description="UART communication to main bus" },
        @{ target="../../sensor-processing"; type="i2c_communication"; interface="I2C Bus"; signals=@("SDA","SCL"); description="I2C communication with sensor processing" },
        @{ target="../../pcb1-high-power-board"; type="spi_communication"; interface="SPI Bus"; signals=@("MOSI","MISO","CLK","CS"); description="SPI communication with high power board" }
    )
    "pcb2-low-power-board/sensor-processing" = @(
        @{ target="../communication-hub"; type="i2c_communication"; interface="I2C Bus"; signals=@("SDA","SCL"); description="I2C communication with communication hub" },
        @{ target="../../pcb1-high-power-board/motor-control"; type="analog_signal"; interface="Analog Interface"; signals=@("Position","Velocity","Current"); description="Analog sensor feedback to motor control" }
    )
    "pcb2-low-power-board/sensor-processing/imu" = @(
        @{ target="../temperature-sensor"; type="i2c_communication"; interface="I2C Bus"; signals=@("SDA","SCL"); description="I2C communication with temperature sensor" },
        @{ target="../../communication-hub"; type="spi_communication"; interface="SPI Bus"; signals=@("MOSI","MISO","CLK","CS"); description="SPI communication with communication hub" }
    )
    "pcb2-low-power-board/sensor-processing/temperature-sensor" = @(
        @{ target="../imu"; type="i2c_communication"; interface="I2C Bus"; signals=@("SDA","SCL"); description="I2C communication with IMU" },
        @{ target="../../communication-hub"; type="analog_signal"; interface="Analog ADC"; signals=@("Temperature","Ref_Voltage"); description="Analog temperature reading" }
    )
    "pcb2-low-power-board/touch-interface" = @(
        @{ target="../communication-hub"; type="i2c_communication"; interface="I2C Bus"; signals=@("SDA","SCL"); description="I2C communication with communication hub" }
    )
    "pcb2-low-power-board/touch-interface/touch-controller" = @(
        @{ target="../touch-skin-connectors"; type="capacitive_touch"; interface="Touch Sensor Array"; signals=@("Touch_1","Touch_2","Touch_3","Touch_4"); description="Capacitive touch sensor array" },
        @{ target="../../communication-hub"; type="spi_communication"; interface="SPI Bus"; signals=@("MOSI","MISO","CLK","CS"); description="SPI communication with communication hub" }
    )
    "pcb2-low-power-board/touch-interface/touch-skin-connectors" = @(
        @{ target="../touch-controller"; type="capacitive_touch"; interface="Touch Sensor Array"; signals=@("Touch_1","Touch_2","Touch_3","Touch_4"); description="Touch sensor connector array" }
    )
    "pcb3-force-torque-assembly" = @(
        @{ target="pcb1-high-power-board"; type="sensor_interface"; interface="Sensor Interface"; signals=@("Force_X","Force_Y","Force_Z","Torque_X","Torque_Y","Torque_Z"); description="Force and torque sensor data" },
        @{ target="pcb2-low-power-board/communication-hub"; type="can_communication"; interface="CAN Bus"; signals=@("CAN_H","CAN_L"); description="CAN communication with communication hub" }
    )
    "pcb3-force-torque-assembly/ft-sensing" = @(
        @{ target="../../pcb2-low-power-board/communication-hub"; type="can_communication"; interface="CAN Bus"; signals=@("CAN_H","CAN_L"); description="CAN communication with communication hub" }
    )
    "pcb3-force-torque-assembly/ft-sensing/force-torque-sensors" = @(
        @{ target="../ft-mcu-controller"; type="analog_signal"; interface="Analog ADC"; signals=@("Force_X","Force_Y","Force_Z","Torque_X","Torque_Y","Torque_Z"); description="Analog force and torque sensor signals" },
        @{ target="../signal-conditioning"; type="analog_signal"; interface="Analog Interface"; signals=@("Raw_Force","Raw_Torque"); description="Raw analog sensor signals for conditioning" }
    )
    "pcb3-force-torque-assembly/ft-sensing/ft-mcu-controller" = @(
        @{ target="../force-torque-sensors"; type="analog_signal"; interface="Analog ADC"; signals=@("Force_X","Force_Y","Force_Z","Torque_X","Torque_Y","Torque_Z"); description="Processed force and torque sensor readings" },
        @{ target="../signal-conditioning"; type="analog_signal"; interface="Analog Interface"; signals=@("Conditioned_Force","Conditioned_Torque"); description="Signal conditioned analog inputs" },
        @{ target="../../pcb2-low-power-board/communication-hub"; type="can_communication"; interface="CAN Bus"; signals=@("CAN_H","CAN_L"); description="CAN communication with communication hub" }
    )
    "pcb3-force-torque-assembly/ft-sensing/signal-conditioning" = @(
        @{ target="../ft-mcu-controller"; type="analog_signal"; interface="Analog Interface"; signals=@("Conditioned_Force","Conditioned_Torque"); description="Conditioned analog signals to MCU" },
        @{ target="../force-torque-sensors"; type="analog_signal"; interface="Analog Interface"; signals=@("Raw_Force","Raw_Torque"); description="Raw analog signals from sensors" }
    )
}

Write-Host "Creating Robot ARM PCB System with perfect JSON format..." -ForegroundColor Green
Write-Host "Target path: $RootPath" -ForegroundColor Cyan
Write-Host "=" * 60

if (-not (Test-Path $RootPath)) {
    New-Item -Path $RootPath -ItemType Directory -Force | Out-Null
    Write-Host "Created root directory: $RootPath" -ForegroundColor Green
}

$createdDirs = 0
$createdFiles = 0

foreach ($modulePath in $AllModules.Keys) {
    if ($modulePath -eq "robot-arm-segment-pcb-system") {
        $fullDirPath = $RootPath
    } else {
        $fullDirPath = Join-Path -Path $RootPath -ChildPath $modulePath
    }
    
    if (-not (Test-Path $fullDirPath)) {
        New-Item -Path $fullDirPath -ItemType Directory -Force | Out-Null
        Write-Host "Created directory: $modulePath" -ForegroundColor Green
        $createdDirs++
    }
    
    $connections = $AllModules[$modulePath]
    $jsonContent = Create-ConnectionsJson -connections $connections
    $connectionsFile = Join-Path -Path $fullDirPath -ChildPath "connections.json"
    
    $jsonContent | Out-File -FilePath $connectionsFile -Encoding UTF8 -Force
    Write-Host "Created connections.json: $modulePath ($($connections.Count) connections)" -ForegroundColor Yellow
    $createdFiles++
}

Write-Host "`n" + "=" * 60
Write-Host "BUILD COMPLETE!" -ForegroundColor Green
Write-Host "Directories created: $createdDirs" -ForegroundColor Cyan
Write-Host "Connection files created: $createdFiles" -ForegroundColor Cyan
Write-Host "`nYour robot-arm-segment-pcb-system is ready with perfect JSON format!" -ForegroundColor Green